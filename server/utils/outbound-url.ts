import type { LookupAddress } from 'node:dns'
import type { IncomingHttpHeaders } from 'node:http'
import type { LookupFunction } from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

// Matches the redirect limit of the fetch implementation this replaced.
export const MAX_REDIRECTS = 20

export interface OutboundAddress {
  address: string
  family: 4 | 6
}

export interface OutboundResponse {
  status: number
  headers: IncomingHttpHeaders
}

export interface OutboundRequest {
  url: URL
  addresses: OutboundAddress[]
  headers: Record<string, string>
  signal: AbortSignal
}

export type OutboundResolver = (hostname: string) => Promise<OutboundAddress[]>
export type OutboundConnector = (request: OutboundRequest) => Promise<OutboundResponse>

export interface OutboundUrlOptions {
  timeoutMs: number
  headers?: Record<string, string>
  signal?: AbortSignal
  resolver?: OutboundResolver
  connector?: OutboundConnector
}

export interface OutboundUrlResult {
  status: number
  url: string
}

export class OutboundUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutboundUrlError'
  }
}

const IPV4_BLOCKED_RANGES: Array<readonly [number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8 "this network"
  [0x0A000000, 8], // 10.0.0.0/8 private
  [0x64400000, 10], // 100.64.0.0/10 carrier-grade NAT
  [0x7F000000, 8], // 127.0.0.0/8 loopback
  [0xA9FE0000, 16], // 169.254.0.0/16 link-local
  [0xAC100000, 12], // 172.16.0.0/12 private
  [0xC0000000, 24], // 192.0.0.0/24 IETF protocol assignments
  [0xC0000200, 24], // 192.0.2.0/24 TEST-NET-1
  [0xC0586300, 24], // 192.88.99.0/24 deprecated 6to4 relay anycast
  [0xC0A80000, 16], // 192.168.0.0/16 private
  [0xC6120000, 15], // 198.18.0.0/15 benchmarking
  [0xC6336400, 24], // 198.51.100.0/24 TEST-NET-2
  [0xCB007100, 24], // 203.0.113.0/24 TEST-NET-3
  [0xE0000000, 4], // 224.0.0.0/4 multicast
  [0xF0000000, 4], // 240.0.0.0/4 reserved
]

// Conservative global policy: ordinary IPv6 is allowed only inside 2000::/3, and the
// IANA special-purpose ranges within it stay denied. IPv4-mapped, IPv4-compatible, and
// standard NAT64 (64:ff9b::/96) addresses are judged solely by their embedded IPv4.
const IPV6_GLOBAL_UNICAST_PREFIX: readonly [number[], number] = [[0x20], 3] // 2000::/3

const IPV6_BLOCKED_PREFIXES: Array<readonly [number[], number]> = [
  [[0x20, 0x01], 23], // 2001::/23 IETF protocol assignments (Teredo, benchmarking, ORCHID, ...)
  [[0x20, 0x01, 0x0D, 0xB8], 32], // 2001:db8::/32 documentation
  [[0x20, 0x02], 16], // 2002::/16 6to4
  [[0x3F, 0xFF], 20], // 3fff::/20 documentation
]

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4)
    return null

  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part))
      return null

    const byte = Number(part)
    if (byte > 255)
      return null

    value = (value << 8) | byte
  }

  return value >>> 0
}

function inIpv4Range(value: number, network: number, bits: number): boolean {
  const mask = (0xFFFFFFFF << (32 - bits)) >>> 0
  return (value & mask) === (network & mask)
}

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToInt(address)
  if (value === null)
    return true

  return IPV4_BLOCKED_RANGES.some(([network, bits]) => inIpv4Range(value, network, bits))
}

function parseIpv6(input: string): number[] | null {
  let text = input
  const zoneIndex = text.indexOf('%')
  if (zoneIndex !== -1)
    text = text.slice(0, zoneIndex)

  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  if (tail.includes('.')) {
    const ipv4 = ipv4ToInt(tail)
    if (ipv4 === null)
      return null

    const high = ((ipv4 >>> 16) & 0xFFFF).toString(16)
    const low = (ipv4 & 0xFFFF).toString(16)
    text = `${text.slice(0, lastColon)}:${high}:${low}`
  }

  const halves = text.split('::')
  if (halves.length > 2)
    return null

  const head = halves[0] ? halves[0].split(':') : []
  const tailParts = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (halves.length === 1 && head.length !== 8)
    return null

  const missing = 8 - head.length - tailParts.length
  if (missing < 0 || (halves.length === 1 && missing !== 0))
    return null

  const groups = [...head, ...Array.from<string>({ length: missing }).fill('0'), ...tailParts]
  const bytes: number[] = []
  for (const group of groups) {
    if (!/^[\dA-F]{1,4}$/i.test(group))
      return null

    const value = Number.parseInt(group, 16)
    bytes.push(value >> 8, value & 0xFF)
  }

  return bytes.length === 16 ? bytes : null
}

function matchesPrefix(bytes: number[], prefix: number[], bits: number): boolean {
  const prefixLength = Math.ceil(bits / 8)
  for (let index = 0; index < prefixLength; index++) {
    const take = Math.min(8, bits - index * 8)
    const mask = (0xFF << (8 - take)) & 0xFF
    const expected = prefix[index] ?? 0
    if ((bytes[index]! & mask) !== (expected & mask))
      return false
  }

  return true
}

function embeddedIpv4(bytes: number[]): string | null {
  const mapped = bytes.slice(0, 10).every(byte => byte === 0) && bytes[10] === 0xFF && bytes[11] === 0xFF
  const compatible = bytes.slice(0, 12).every(byte => byte === 0)
  const nat64 = bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xFF && bytes[3] === 0x9B && bytes.slice(4, 12).every(byte => byte === 0)
  if (!mapped && !compatible && !nat64)
    return null

  return bytes.slice(12).join('.')
}

function isBlockedIpv6(bytes: number[]): boolean {
  const ipv4 = embeddedIpv4(bytes)
  if (ipv4)
    return isBlockedIpv4(ipv4)

  if (!matchesPrefix(bytes, IPV6_GLOBAL_UNICAST_PREFIX[0], IPV6_GLOBAL_UNICAST_PREFIX[1]))
    return true

  return IPV6_BLOCKED_PREFIXES.some(([prefix, bits]) => matchesPrefix(bytes, prefix, bits))
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4)
    return !isBlockedIpv4(address)

  if (family === 6) {
    const bytes = parseIpv6(address)
    // An IPv6 literal we cannot parse must never be treated as public.
    return bytes !== null && !isBlockedIpv6(bytes)
  }

  return false
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

async function defaultResolver(hostname: string): Promise<OutboundAddress[]> {
  const answers = await dnsLookup(hostname, { all: true })
  return answers.map(({ address, family }) => ({ address, family: family as 4 | 6 }))
}

export async function resolvePublicAddresses(
  hostname: string,
  resolver: OutboundResolver = defaultResolver,
): Promise<OutboundAddress[]> {
  const name = normalizeHostname(hostname)
  const literalFamily = isIP(name)
  if (literalFamily) {
    if (!isPublicAddress(name))
      throw new OutboundUrlError(`Blocked outbound address: ${name}`)

    return [{ address: name, family: literalFamily as 4 | 6 }]
  }

  const answers = await resolver(name)
  const unique = [...new Map(
    answers
      .filter(answer => answer && typeof answer.address === 'string')
      .map(answer => [answer.address, answer] as const),
  ).values()]
  if (unique.length === 0)
    throw new Error(`Unable to resolve host: ${name}`)

  for (const { address } of unique) {
    if (!isPublicAddress(address))
      throw new OutboundUrlError(`Blocked outbound address: ${address}`)
  }

  return unique.map(({ address }) => ({ address, family: isIP(address) as 4 | 6 }))
}

function parsePublicHttpUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  }
  catch {
    throw new OutboundUrlError(`Invalid URL: ${rawUrl}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new OutboundUrlError(`Blocked URL protocol: ${url.protocol}`)

  if (!url.hostname)
    throw new OutboundUrlError('URL is missing a hostname')

  if (url.username || url.password)
    throw new OutboundUrlError('URL credentials are not allowed')

  return url
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function getLocation(headers: IncomingHttpHeaders): string | undefined {
  const location = headers.location
  return Array.isArray(location) ? location[0] : location
}

export function createPinnedLookup(addresses: OutboundAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const family = options?.family
    const candidates = (family === 4 || family === 6)
      ? addresses.filter(item => item.family === family)
      : addresses

    if (candidates.length === 0) {
      const error: NodeJS.ErrnoException = new Error('No validated address available')
      error.code = 'ENOTFOUND'
      callback(error, '')
      return
    }

    if (options?.all) {
      callback(null, candidates.map(({ address, family: itemFamily }): LookupAddress => ({ address, family: itemFamily })))
      return
    }

    const first = candidates[0]!
    callback(null, first.address, first.family)
  }
}

export function sendPinnedRequest({ url, addresses, headers, signal }: OutboundRequest): Promise<OutboundResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET',
      headers,
      // A one-off agent prevents socket reuse forced by a different resolver.
      agent: false,
      lookup: createPinnedLookup(addresses),
      signal,
    }, (response) => {
      const result: OutboundResponse = {
        status: response.statusCode ?? 0,
        headers: response.headers,
      }
      // Headers are enough for a check; cancel the body to bound the transfer.
      response.destroy()
      resolve(result)
    })

    request.on('error', reject)
    request.end()
  })
}

export function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(signal.reason)

  return new Promise<T>((resolve, reject) => {
    function cleanup() {
      signal.removeEventListener('abort', onAbort)
    }
    function onAbort() {
      cleanup()
      reject(signal.reason)
    }

    // The rejection handler also keeps a late resolver failure from becoming unhandled.
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

async function resolveWithSignal(
  hostname: string,
  resolver: OutboundResolver,
  signal: AbortSignal,
): Promise<OutboundAddress[]> {
  signal.throwIfAborted()
  const addresses = await raceWithAbort(resolvePublicAddresses(hostname, resolver), signal)
  signal.throwIfAborted()
  return addresses
}

export async function requestPublicUrl(rawUrl: string, options: OutboundUrlOptions): Promise<OutboundUrlResult> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal
  const resolver = options.resolver ?? defaultResolver
  const connector = options.connector ?? sendPinnedRequest
  const headers = options.headers ?? {}

  let url = parsePublicHttpUrl(rawUrl)
  for (let redirects = 0; ; redirects++) {
    const addresses = await resolveWithSignal(url.hostname, resolver, signal)
    const response = await connector({ url, addresses, headers, signal })

    const location = getLocation(response.headers)
    if (!isRedirectStatus(response.status) || !location)
      return { status: response.status, url: url.toString() }

    if (redirects >= MAX_REDIRECTS)
      throw new Error(`Too many redirects (limit ${MAX_REDIRECTS})`)

    let next: URL
    try {
      next = new URL(location, url)
    }
    catch {
      throw new OutboundUrlError(`Invalid redirect location: ${location}`)
    }

    url = parsePublicHttpUrl(next.toString())
  }
}
