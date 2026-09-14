import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { deleteStoredLinks, fetch, fetchWithAuth, postJson, server, useTestServer } from '../utils'

const createdSlugs: string[] = []

useTestServer()

afterAll(async () => {
  await deleteStoredLinks(createdSlugs)
})

async function createGeoLink(slug: string): Promise<void> {
  const response = await postJson('/api/link/create', {
    url: 'https://example.com/default',
    slug,
    geo: { CN: 'https://cn.example.com/landing' },
  })
  expect(response.status).toBe(201)
  createdSlugs.push(slug)
}

describe('geo routing without a database', () => {
  it('starts normally and falls back to the default URL and empty location', async () => {
    await vi.waitFor(() => expect(server.logs).toContain('[geo] No GeoIP database found'))

    const slug = `geo-no-database-${crypto.randomUUID()}`
    await createGeoLink(slug)

    const response = await fetch(`/${slug}`)

    expect(response.status).toBe(301)
    expect(response.headers.get('Location')).toBe('https://example.com/default')

    const location = await fetchWithAuth('/api/location')
    expect(location.status).toBe(200)
    expect(await location.json()).toEqual({})
  })
})

describe('geo routing with a corrupt database', () => {
  it('stays healthy, fails open, and records empty geographic access log fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'slite-geo-'))
    const database = join(dir, 'geoip.mmdb')
    await writeFile(database, 'not a maxmind database')
    await server.restart({ NUXT_GEOIP_PATH: database })

    try {
      await vi.waitFor(() => expect(server.logs).toContain('[geo] Failed to open GeoIP database'))

      const slug = `geo-corrupt-${crypto.randomUUID()}`
      await createGeoLink(slug)

      const response = await fetch(`/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      expect(response.status).toBe(301)
      expect(response.headers.get('Location')).toBe('https://example.com/default')

      const eventsResponse = await fetchWithAuth(`/api/logs/events?slug=${slug}`)
      expect(eventsResponse.status).toBe(200)
      const events = await eventsResponse.json() as Array<Record<string, unknown>>
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        slug,
        country: '',
        region: '',
        city: '',
        timezone: '',
        latitude: null,
        longitude: null,
      })
      expect(events[0]).not.toHaveProperty('ip')

      const location = await fetchWithAuth('/api/location')
      expect(await location.json()).toEqual({})
    }
    finally {
      await server.restart()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
