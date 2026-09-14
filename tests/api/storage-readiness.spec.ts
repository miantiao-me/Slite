import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteStoredLinks, fetch, fetchWithAuth, postJson, server } from '../utils'

// A directory named analytics.duckdb makes DuckDB fail to open after SQLite and
// the link cache are initialized. The server must stay healthy: redirects and
// link APIs keep working, and only the stats and logs endpoints answer 503.
describe('analytics degradation over HTTP', () => {
  const slugs: string[] = []

  beforeAll(async () => {
    server.dataDir = await mkdtemp(join(tmpdir(), 'slite-analytics-down-'))
    await mkdir(join(server.dataDir, 'analytics.duckdb'))
    await server.start()
  })

  afterAll(async () => {
    await deleteStoredLinks(slugs)
  })

  it('keeps core storage and link APIs available', async () => {
    expect((await fetchWithAuth('/api/verify')).status).toBe(200)
    expect((await fetchWithAuth('/api/link/count')).status).toBe(200)
  })

  it('keeps redirects working when the analytics write is unavailable', async () => {
    const slug = `analytics-down-${crypto.randomUUID()}`
    slugs.push(slug)
    expect((await postJson('/api/link/create', { slug, url: 'https://example.com/degraded' })).status).toBe(201)
    expect((await fetch(`/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).status).toBe(301)

    // Degraded analytics skips the write silently instead of logging a failure
    // for every redirect.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(server.logs).not.toContain('access_log.write.failed')
  })

  it('answers stats endpoints with a user-facing 503', async () => {
    const response = await fetchWithAuth('/api/stats/views?slug=0&unit=day')
    expect(response.status).toBe(503)
    const body = await response.json() as { statusCode: number, statusMessage: string }
    expect(body.statusCode).toBe(503)
    expect(body.statusMessage).toBe('Analytics unavailable')
  })

  it('answers log endpoints with a user-facing 503', async () => {
    const response = await fetchWithAuth('/api/logs/events?limit=10')
    expect(response.status).toBe(503)
    const body = await response.json() as { statusCode: number, statusMessage: string }
    expect(body.statusCode).toBe(503)
    expect(body.statusMessage).toBe('Analytics unavailable')
  })

  it('records the analytics failure in the server logs exactly once', async () => {
    await vi.waitFor(() => {
      expect(server.logs).toContain('[analytics] DuckDB initialization failed')
    })
    expect(server.logs.match(/\[analytics\] DuckDB initialization failed/g)).toHaveLength(1)
  })
})
