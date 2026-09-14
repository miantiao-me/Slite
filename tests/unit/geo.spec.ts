import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeGeo, initializeGeo, lookupGeo, resolveGeoDatabasePath } from '../../server/services/geo'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  open: vi.fn(),
}))

vi.mock('maxmind', () => ({ open: mocks.open }))

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'slite-geo-'))
  tempDirs.push(dir)
  return dir
}

async function initializeWithReader(): Promise<void> {
  const dir = await createTempDir()
  const database = join(dir, 'geoip.mmdb')
  await writeFile(database, 'fake database')
  mocks.open.mockResolvedValueOnce({ get: mocks.get })
  await initializeGeo({ geoipPath: database })
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(async () => {
  closeGeo()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('geo database path resolution', () => {
  it('prefers the explicit path, then dataDir geoip.mmdb, then dbip-city-lite.mmdb', async () => {
    const dataDir = await createTempDir()
    const explicit = join(dataDir, 'explicit.mmdb')
    const primary = join(dataDir, 'geoip.mmdb')
    const secondary = join(dataDir, 'dbip-city-lite.mmdb')

    expect(resolveGeoDatabasePath({ dataDir })).toBeUndefined()

    await writeFile(secondary, '')
    expect(resolveGeoDatabasePath({ dataDir })).toBe(secondary)

    await writeFile(primary, '')
    expect(resolveGeoDatabasePath({ dataDir })).toBe(primary)

    await writeFile(explicit, '')
    expect(resolveGeoDatabasePath({ dataDir, geoipPath: explicit })).toBe(explicit)
  })
})

describe('geo service fail-open', () => {
  it('stays disabled without a database and returns no location', async () => {
    const dataDir = await createTempDir()
    await expect(initializeGeo({ dataDir })).resolves.toBeUndefined()
    expect(lookupGeo('8.8.8.8')).toBeUndefined()
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('stays disabled when the database cannot be opened', async () => {
    const dir = await createTempDir()
    const database = join(dir, 'geoip.mmdb')
    await writeFile(database, 'corrupt')
    mocks.open.mockRejectedValueOnce(new Error('Unknown type'))

    await expect(initializeGeo({ geoipPath: database })).resolves.toBeUndefined()
    expect(mocks.open).toHaveBeenCalledWith(database)
    expect(lookupGeo('8.8.8.8')).toBeUndefined()
  })
})

describe('geo lookup', () => {
  it('maps and cleans city records', async () => {
    await initializeWithReader()
    mocks.get.mockReturnValueOnce({
      country: { iso_code: ' cn ' },
      subdivisions: [{ names: { en: '  New   York ' } }],
      city: { names: { en: 'New York' } },
      location: { latitude: 40.7128, longitude: -74.006 },
    })

    expect(lookupGeo('8.8.8.8')).toEqual({
      country: 'CN',
      region: 'New York',
      city: 'New York',
      latitude: 40.7128,
      longitude: -74.006,
    })
    expect(mocks.get).toHaveBeenCalledWith('8.8.8.8')
  })

  it('falls back to the registered country and drops malformed values', async () => {
    await initializeWithReader()
    mocks.get.mockReturnValueOnce({
      registered_country: { iso_code: 'DE' },
      city: { names: {} },
      subdivisions: [{ names: { en: 'x'.repeat(300) } }],
      location: { latitude: 91, longitude: 181 },
    })

    expect(lookupGeo('1.1.1.1')).toEqual({
      country: 'DE',
      region: 'x'.repeat(128),
      city: '',
      latitude: null,
      longitude: null,
    })
  })

  it('returns nothing when the database has no record for the address', async () => {
    await initializeWithReader()
    mocks.get.mockReturnValueOnce(null)
    expect(lookupGeo('8.8.8.8')).toBeUndefined()
  })

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.10',
    '169.254.1.1',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fd00::1',
    'not-an-ip',
    '',
    undefined,
  ])('skips non-public or invalid address %s without reading the database', async (ip) => {
    await initializeWithReader()
    expect(lookupGeo(ip)).toBeUndefined()
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('closes the reader and re-initializes cleanly', async () => {
    await initializeWithReader()
    mocks.get.mockReturnValueOnce({ country: { iso_code: 'US' }, location: { latitude: 1, longitude: 2 } })
    expect(lookupGeo('8.8.8.8')?.country).toBe('US')

    closeGeo()
    expect(lookupGeo('8.8.8.8')).toBeUndefined()

    await initializeWithReader()
    mocks.get.mockReturnValueOnce({ country: { iso_code: 'FR' }, location: { latitude: 3, longitude: 4 } })
    expect(lookupGeo('8.8.8.8')?.country).toBe('FR')
  })
})
