import type { LookupOptions } from 'node:dns'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { OutboundAddress, OutboundConnector, OutboundRequest, OutboundResolver, OutboundResponse } from '../../server/utils/outbound-url'
import { getEventListeners, once } from 'node:events'
import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  createPinnedLookup,
  isPublicAddress,
  MAX_REDIRECTS,
  OutboundUrlError,
  raceWithAbort,
  requestPublicUrl,
  resolvePublicAddresses,
  sendPinnedRequest,
} from '../../server/utils/outbound-url'

const PUBLIC_IPV4: OutboundAddress = { address: '93.184.216.34', family: 4 }

function startServer(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  const listening = once(server, 'listening')

  return listening.then(() => {
    const { port } = server.address() as AddressInfo
    return {
      port,
      close: async () => {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      },
    }
  })
}

function publicResolver(): OutboundResolver {
  return vi.fn(async () => [PUBLIC_IPV4])
}

function lookupOnce(lookup: ReturnType<typeof createPinnedLookup>, hostname: string, options: LookupOptions = {}) {
  return new Promise<string[]>((resolve, reject) => {
    lookup(hostname, options, (error, address) => {
      if (error) {
        reject(error)
        return
      }

      resolve(Array.isArray(address) ? address.map(item => item.address) : [address])
    })
  })
}

async function expectSettledWithin(promise: Promise<unknown>, milliseconds: number): Promise<void> {
  const outcome = await Promise.race([
    promise.then(() => 'settled', () => 'settled'),
    new Promise(resolve => setTimeout(resolve, milliseconds, 'pending')),
  ])

  expect(outcome).toBe('settled')
}

describe('isPublicAddress', () => {
  it.each([
    '0.0.0.0',
    '0.255.255.255',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456:789a::1',
    'fe80::1',
    'fec0::1',
    'ff02::1',
    '100::1',
    '100:0:0:1::1',
    '5f00::1',
    '2001::1',
    '2001:2::1',
    '2001:10::1',
    '2001:20::1',
    '2001:100::1',
    '2001:1ff::1',
    '2001:db8::1',
    '2002:7f00:1::',
    '2002:c0a8:101::1',
    '3fff::1',
    '3fff:fff::1',
    '64:ff9b:1::a00:1',
    '64:ff9b:1::808:808',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:192.168.0.1',
    '::10.0.0.1',
    '64:ff9b::a00:1',
    '64:ff9b::c0a8:1',
  ])('rejects %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '185.199.108.153',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '2a00:1450:4001:800::200e',
    '::ffff:8.8.8.8',
    '::8.8.8.8',
    '64:ff9b::808:808',
  ])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it('rejects values that are not IP literals', () => {
    expect(isPublicAddress('example.com')).toBe(false)
    expect(isPublicAddress('')).toBe(false)
  })
})

describe('resolvePublicAddresses', () => {
  it('returns every public answer', async () => {
    const resolver = vi.fn(async (): Promise<OutboundAddress[]> => [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ])

    await expect(resolvePublicAddresses('example.test', resolver)).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ])
  })

  it('rejects private DNS answers', async () => {
    const resolver = vi.fn(async (): Promise<OutboundAddress[]> => [{ address: '10.0.0.5', family: 4 }])
    await expect(resolvePublicAddresses('internal.test', resolver)).rejects.toBeInstanceOf(OutboundUrlError)
  })

  it('rejects mixed public and private DNS answers', async () => {
    const resolver = vi.fn(async (): Promise<OutboundAddress[]> => [
      PUBLIC_IPV4,
      { address: '127.0.0.1', family: 4 },
    ])
    await expect(resolvePublicAddresses('mixed.test', resolver)).rejects.toBeInstanceOf(OutboundUrlError)
  })

  it('rejects empty DNS answers without connecting', async () => {
    const resolver = vi.fn(async (): Promise<OutboundAddress[]> => [])
    await expect(resolvePublicAddresses('empty.test', resolver)).rejects.toThrow('Unable to resolve host')
  })

  it('rejects private literals without DNS resolution', async () => {
    const resolver = vi.fn(async (): Promise<OutboundAddress[]> => [PUBLIC_IPV4])
    await expect(resolvePublicAddresses('[::1]', resolver)).rejects.toBeInstanceOf(OutboundUrlError)
    await expect(resolvePublicAddresses('169.254.169.254', resolver)).rejects.toBeInstanceOf(OutboundUrlError)
    expect(resolver).not.toHaveBeenCalled()
  })

  it('keeps public literals without DNS resolution', async () => {
    const resolver = vi.fn(async (): Promise<OutboundAddress[]> => [])
    await expect(resolvePublicAddresses('8.8.8.8', resolver)).resolves.toEqual([{ address: '8.8.8.8', family: 4 }])
    expect(resolver).not.toHaveBeenCalled()
  })
})

describe('raceWithAbort', () => {
  it('rejects with the abort reason and removes its listener', async () => {
    const controller = new AbortController()
    const raced = raceWithAbort(new Promise<never>(() => {}), controller.signal)

    controller.abort(new Error('test abort'))

    await expect(raced).rejects.toThrow('test abort')
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('removes its listener when the promise settles first', async () => {
    const controller = new AbortController()

    await expect(raceWithAbort(Promise.resolve('done'), controller.signal)).resolves.toBe('done')
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('removes its listener when the promise rejects first', async () => {
    const controller = new AbortController()

    await expect(raceWithAbort(Promise.reject(new Error('resolution failed')), controller.signal)).rejects.toThrow('resolution failed')
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already aborted'))

    await expect(raceWithAbort(Promise.resolve('done'), controller.signal)).rejects.toThrow('already aborted')
  })
})

describe('createPinnedLookup', () => {
  it('returns the validated address for any hostname', async () => {
    const lookup = createPinnedLookup([PUBLIC_IPV4])
    await expect(lookupOnce(lookup, 'anything.invalid')).resolves.toEqual(['93.184.216.34'])
  })

  it('returns every validated address when all answers are requested', async () => {
    const lookup = createPinnedLookup([
      PUBLIC_IPV4,
      { address: '2606:4700:4700::1111', family: 6 },
    ])
    await expect(lookupOnce(lookup, 'anything.invalid', { all: true })).resolves.toEqual([
      '93.184.216.34',
      '2606:4700:4700::1111',
    ])
  })

  it('fails when no validated address matches the requested family', async () => {
    const lookup = createPinnedLookup([PUBLIC_IPV4])
    await expect(lookupOnce(lookup, 'anything.invalid', { all: true, family: 6 })).rejects.toMatchObject({ code: 'ENOTFOUND' })
  })
})

describe('requestPublicUrl', () => {
  it('rejects unsupported protocols without resolving or connecting', async () => {
    const resolver = publicResolver()
    const connector = vi.fn(async (): Promise<OutboundResponse> => ({ status: 200, headers: {} }))

    await expect(requestPublicUrl('file:///etc/passwd', { timeoutMs: 1000, resolver, connector })).rejects.toBeInstanceOf(OutboundUrlError)
    await expect(requestPublicUrl('ftp://example.test/file', { timeoutMs: 1000, resolver, connector })).rejects.toBeInstanceOf(OutboundUrlError)
    expect(resolver).not.toHaveBeenCalled()
    expect(connector).not.toHaveBeenCalled()
  })

  it('rejects URLs with embedded credentials', async () => {
    const resolver = publicResolver()
    const connector = vi.fn(async (): Promise<OutboundResponse> => ({ status: 200, headers: {} }))

    await expect(requestPublicUrl('http://user:secret@example.test/', { timeoutMs: 1000, resolver, connector })).rejects.toBeInstanceOf(OutboundUrlError)
    expect(connector).not.toHaveBeenCalled()
  })

  it('rejects private literals without connecting', async () => {
    const resolver = publicResolver()
    const connector = vi.fn(async (): Promise<OutboundResponse> => ({ status: 200, headers: {} }))

    await expect(requestPublicUrl('http://169.254.169.254/latest/meta-data', { timeoutMs: 1000, resolver, connector })).rejects.toBeInstanceOf(OutboundUrlError)
    await expect(requestPublicUrl('http://[::1]:8080/', { timeoutMs: 1000, resolver, connector })).rejects.toBeInstanceOf(OutboundUrlError)
    await expect(requestPublicUrl('http://[::ffff:7f00:1]/', { timeoutMs: 1000, resolver, connector })).rejects.toBeInstanceOf(OutboundUrlError)
    expect(resolver).not.toHaveBeenCalled()
    expect(connector).not.toHaveBeenCalled()
  })

  it('rejects private and mixed DNS answers without connecting', async () => {
    const connector = vi.fn(async (): Promise<OutboundResponse> => ({ status: 200, headers: {} }))

    await expect(requestPublicUrl('http://private.test/', {
      timeoutMs: 1000,
      resolver: vi.fn(async () => [{ address: '10.0.0.5', family: 4 as const }]),
      connector,
    })).rejects.toBeInstanceOf(OutboundUrlError)

    await expect(requestPublicUrl('http://mixed.test/', {
      timeoutMs: 1000,
      resolver: vi.fn(async () => [PUBLIC_IPV4, { address: '192.168.1.10', family: 4 as const }]),
      connector,
    })).rejects.toBeInstanceOf(OutboundUrlError)

    expect(connector).not.toHaveBeenCalled()
  })

  it('validates every redirect hop and never contacts a private target', async () => {
    let privateHits = 0
    const privateTarget = await startServer((_request, response) => {
      privateHits++
      response.end('secret')
    })

    try {
      const connector = vi.fn(async (): Promise<OutboundResponse> => ({
        status: 302,
        headers: { location: `http://127.0.0.1:${privateTarget.port}/secret` },
      }))

      await expect(requestPublicUrl('http://public.test/start', {
        timeoutMs: 1000,
        resolver: publicResolver(),
        connector,
      })).rejects.toBeInstanceOf(OutboundUrlError)

      expect(connector).toHaveBeenCalledTimes(1)
      expect(privateHits).toBe(0)
    }
    finally {
      await privateTarget.close()
    }
  })

  it('rejects redirects to cloud metadata endpoints', async () => {
    const connector = vi.fn(async (): Promise<OutboundResponse> => ({
      status: 301,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    }))

    await expect(requestPublicUrl('http://public.test/start', {
      timeoutMs: 1000,
      resolver: publicResolver(),
      connector,
    })).rejects.toBeInstanceOf(OutboundUrlError)
    expect(connector).toHaveBeenCalledTimes(1)
  })

  it('follows public redirects and resolves relative locations', async () => {
    const resolver = vi.fn(async (hostname: string): Promise<OutboundAddress[]> => {
      if (hostname === 'first.test' || hostname === 'second.test')
        return [PUBLIC_IPV4]
      throw new Error(`Unexpected hostname: ${hostname}`)
    })
    const connector = vi.fn(async ({ url }: OutboundRequest): Promise<OutboundResponse> => {
      if (url.pathname === '/start')
        return { status: 302, headers: { location: '//second.test/redirected' } }
      return { status: 204, headers: {} }
    })

    await expect(requestPublicUrl('http://first.test/start', { timeoutMs: 1000, resolver, connector })).resolves.toMatchObject({ status: 204, url: 'http://second.test/redirected' })
    expect(connector).toHaveBeenCalledTimes(2)
    expect(connector.mock.calls[1]![0].url.href).toBe('http://second.test/redirected')
  })

  it('resolves once per hop and pins the validated address', async () => {
    let resolutions = 0
    const resolver = vi.fn(async (): Promise<OutboundAddress[]> => {
      resolutions++
      // A rebinding resolver would answer 127.0.0.1 on the second lookup.
      return resolutions === 1 ? [PUBLIC_IPV4] : [{ address: '127.0.0.1', family: 4 }]
    })
    const connector = vi.fn(async (_request: OutboundRequest): Promise<OutboundResponse> => ({ status: 200, headers: {} }))

    await expect(requestPublicUrl('http://rebind.test/', { timeoutMs: 1000, resolver, connector })).resolves.toMatchObject({ status: 200 })
    expect(resolutions).toBe(1)
    expect(connector).toHaveBeenCalledTimes(1)
    expect(connector.mock.calls[0]![0].addresses).toEqual([PUBLIC_IPV4])
  })

  it('rejects redirect loops beyond the redirect limit', async () => {
    const connector = vi.fn(async ({ url }: OutboundRequest): Promise<OutboundResponse> => ({
      status: 302,
      headers: { location: `${url.pathname}-next` },
    }))

    await expect(requestPublicUrl('http://public.test/start', {
      timeoutMs: 5000,
      resolver: publicResolver(),
      connector,
    })).rejects.toThrow(/Too many redirects/)
    expect(connector).toHaveBeenCalledTimes(MAX_REDIRECTS + 1)
  })

  it('aborts the connector when the timeout expires', async () => {
    let aborted = false
    const connector: OutboundConnector = ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(signal.reason)
      }, { once: true })
    })

    await expect(requestPublicUrl('http://public.test/slow', {
      timeoutMs: 20,
      resolver: publicResolver(),
      connector,
    })).rejects.toBeTruthy()
    expect(aborted).toBe(true)
  })

  it('times out a DNS resolver that never settles', async () => {
    const resolver = vi.fn(() => new Promise<OutboundAddress[]>(() => {}))
    const connector = vi.fn(async (): Promise<OutboundResponse> => ({ status: 200, headers: {} }))

    const pending = requestPublicUrl('http://hanging.test/', {
      timeoutMs: 20,
      resolver,
      connector,
    })

    await expectSettledWithin(pending, 100)
    await expect(pending).rejects.toBeTruthy()
    expect(connector).not.toHaveBeenCalled()
  })

  it('aborts a pending DNS resolution when the caller signal aborts', async () => {
    const controller = new AbortController()
    const resolver = vi.fn(() => new Promise<OutboundAddress[]>(() => {}))
    const connector = vi.fn(async (): Promise<OutboundResponse> => ({ status: 200, headers: {} }))

    const pending = requestPublicUrl('http://hanging.test/', {
      timeoutMs: 5000,
      resolver,
      connector,
      signal: controller.signal,
    })

    setTimeout(() => controller.abort(new Error('caller aborted')), 10)
    await expectSettledWithin(pending, 100)
    await expect(pending).rejects.toThrow('caller aborted')
    expect(connector).not.toHaveBeenCalled()
  })

  it('rejects before resolving when the caller signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already aborted'))
    const resolver = publicResolver()
    const connector = vi.fn(async (): Promise<OutboundResponse> => ({ status: 200, headers: {} }))

    const pending = requestPublicUrl('http://public.test/', {
      timeoutMs: 5000,
      resolver,
      connector,
      signal: controller.signal,
    })

    await expectSettledWithin(pending, 100)
    await expect(pending).rejects.toThrow('already aborted')
    expect(resolver).not.toHaveBeenCalled()
    expect(connector).not.toHaveBeenCalled()
  })

  it('handles a resolver that rejects after the request aborted', async () => {
    const controller = new AbortController()
    let failResolution: (error: Error) => void = () => {}
    const resolver = vi.fn(() => new Promise<OutboundAddress[]>((_resolve, reject) => {
      failResolution = reject
    }))

    const pending = requestPublicUrl('http://late.test/', {
      timeoutMs: 5000,
      resolver,
      signal: controller.signal,
    })
    controller.abort()

    await expect(pending).rejects.toBeTruthy()
    failResolution(new Error('late DNS failure'))
    await new Promise(resolve => setImmediate(resolve))
  })
})

describe('sendPinnedRequest', () => {
  it('connects to the pinned address while preserving the original hostname', async () => {
    let receivedHost = ''
    const target = await startServer((request, response) => {
      receivedHost = request.headers.host ?? ''
      response.writeHead(204)
      response.end()
    })

    try {
      const response = await sendPinnedRequest({
        url: new URL(`http://pinned.invalid:${target.port}/probe`),
        addresses: [{ address: '127.0.0.1', family: 4 }],
        headers: { 'user-agent': 'slite-test' },
        signal: AbortSignal.timeout(2000),
      })

      expect(response.status).toBe(204)
      expect(receivedHost).toBe(`pinned.invalid:${target.port}`)
    }
    finally {
      await target.close()
    }
  })

  it('returns redirect responses without following them', async () => {
    const target = await startServer((_request, response) => {
      response.writeHead(302, { location: '/somewhere-else' })
      response.end()
    })

    try {
      const response = await sendPinnedRequest({
        url: new URL(`http://pinned.invalid:${target.port}/start`),
        addresses: [{ address: '127.0.0.1', family: 4 }],
        headers: {},
        signal: AbortSignal.timeout(2000),
      })

      expect(response.status).toBe(302)
      expect(response.headers.location).toBe('/somewhere-else')
    }
    finally {
      await target.close()
    }
  })

  it('returns after response headers and cancels the streaming body', async () => {
    let resolveClosed: () => void = () => {}
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve
    })
    const target = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.write('chunk')
      response.on('close', resolveClosed)
    })

    try {
      const response = await sendPinnedRequest({
        url: new URL(`http://pinned.invalid:${target.port}/stream`),
        addresses: [{ address: '127.0.0.1', family: 4 }],
        headers: {},
        signal: AbortSignal.timeout(2000),
      })

      expect(response.status).toBe(200)
      await expect(Promise.race([
        closed.then(() => true),
        new Promise(resolve => setTimeout(resolve, 1000, false)),
      ])).resolves.toBe(true)
    }
    finally {
      await target.close()
    }
  })
})
