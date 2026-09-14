import type { CityResponse } from 'maxmind'
import { existsSync } from 'node:fs'
import { isIP } from 'node:net'
import { join } from 'node:path'
import { open } from 'maxmind'

export interface GeoLocation {
  country: string
  region: string
  city: string
  latitude: number | null
  longitude: number | null
}

export interface GeoServiceConfig {
  dataDir?: string
  geoipPath?: string
}

// Mirrors the production image layout: a database can be baked into the image
// without mounting a data directory.
const IMAGE_DATABASE_PATH = '/app/geoip/dbip-city-lite.mmdb'

const MAX_NAME_LENGTH = 128

let reader: Awaited<ReturnType<typeof open<CityResponse>>> | undefined

export function resolveGeoDatabasePath(config: GeoServiceConfig = {}): string | undefined {
  const explicit = String(config.geoipPath || '').trim()
  const dataDir = String(config.dataDir || '/data')
  const candidates = [
    explicit,
    join(dataDir, 'geoip.mmdb'),
    join(dataDir, 'dbip-city-lite.mmdb'),
    IMAGE_DATABASE_PATH,
  ].filter(Boolean)

  return candidates.find(candidate => existsSync(candidate))
}

// DB-IP City Lite omits time zones, so callers must never invent one.
export async function initializeGeo(config: GeoServiceConfig = {}): Promise<void> {
  const path = resolveGeoDatabasePath(config)
  if (!path) {
    console.info('[geo] No GeoIP database found; geographic lookups are disabled.')
    return
  }

  try {
    reader = await open<CityResponse>(path)
    console.info(`[geo] Loaded GeoIP database: ${path}`)
  }
  catch (error) {
    reader = undefined
    console.warn('[geo] Failed to open GeoIP database; geographic lookups are disabled.', error)
  }
}

export function closeGeo(): void {
  reader = undefined
}

export function lookupGeo(ip: string | null | undefined): GeoLocation | undefined {
  if (!reader || !ip || !isPublicIp(ip))
    return undefined

  try {
    const record = reader.get(ip)
    if (!record)
      return undefined

    const country = record.country ?? record.registered_country
    return {
      country: cleanCountry(country?.iso_code),
      region: cleanName(record.subdivisions?.[0]?.names?.en),
      city: cleanName(record.city?.names?.en),
      latitude: cleanCoordinate(record.location?.latitude, 90),
      longitude: cleanCoordinate(record.location?.longitude, 180),
    }
  }
  catch {
    return undefined
  }
}

function cleanName(value: unknown): string {
  if (typeof value !== 'string')
    return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

function cleanCountry(value: unknown): string {
  const country = cleanName(value).toUpperCase()
  return /^[A-Z]{2}$/.test(country) ? country : ''
}

function cleanCoordinate(value: unknown, limit: number): number | null {
  const coordinate = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(coordinate) || Math.abs(coordinate) > limit)
    return null
  return coordinate
}

function isPublicIp(ip: string): boolean {
  const version = isIP(ip)

  if (version === 4) {
    const octets = ip.split('.').map(Number)
    const first = octets[0] ?? 0
    const second = octets[1] ?? 0
    if (first === 0 || first === 10 || first === 127 || first >= 224)
      return false
    if (first === 100 && second >= 64 && second <= 127)
      return false
    if (first === 169 && second === 254)
      return false
    if (first === 172 && second >= 16 && second <= 31)
      return false
    if (first === 192 && second === 168)
      return false
    return true
  }

  if (version === 6) {
    const normalized = ip.toLowerCase()
    if (normalized === '::' || normalized === '::1')
      return false
    if (/^fe[89ab]/.test(normalized))
      return false
    if (normalized.startsWith('fc') || normalized.startsWith('fd'))
      return false
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7)
      return isIP(mapped) === 4 ? isPublicIp(mapped) : true
    }
    return true
  }

  return false
}
