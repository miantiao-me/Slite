import { afterAll, describe, expect, it } from 'vitest'
import { deleteStoredLinks, fetch, fetchWithAuth, postJson, useTestServer } from '../utils'

useTestServer()

const slugs: string[] = []
afterAll(async () => deleteStoredLinks(slugs))

describe('/api/stats/counters', () => {
  it('returns counters data with valid auth', async () => {
    const response = await fetchWithAuth('/api/stats/counters?slug=0')

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('data')
  })

  it('does not count empty referers for direct-only traffic', async () => {
    const slug = `stats-direct-${crypto.randomUUID()}`
    slugs.push(slug)
    expect((await postJson('/api/link/create', { slug, url: 'https://example.com/direct' })).status).toBe(201)
    expect((await fetch(`/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).status).toBe(301)

    await expect.poll(async () => {
      const response = await fetchWithAuth(`/api/stats/counters?slug=${slug}`)
      expect(response.status).toBe(200)
      const data = await response.json() as { data: unknown[] }
      return data.data
    }).toEqual([expect.objectContaining({ visits: 1, visitors: 1, referers: 0 })])
  })
})

describe('/api/stats/metrics', () => {
  it('returns metrics data with valid auth and type', async () => {
    const response = await fetchWithAuth('/api/stats/metrics?slug=0&type=browser')

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('data')
  })

  it.each([
    'browser',
    'browserType',
    'city',
    'country',
    'device',
    'deviceType',
    'ip',
    'language',
    'latitude',
    'longitude',
    'os',
    'referer',
    'region',
    'slug',
    'timezone',
    'ua',
    'url',
  ])('accepts the %s metric type', async (type) => {
    const response = await fetchWithAuth(`/api/stats/metrics?slug=0&type=${type}`)
    expect(response.status).toBe(200)

    const data = await response.json() as { data: Array<{ name: unknown, count: number }> }
    expect(Array.isArray(data.data), `${type} must return a data array`).toBe(true)
    for (const row of data.data) {
      expect(row).toHaveProperty('name')
      expect(row).toHaveProperty('count')
    }
  })

  it('aggregates restored Sink metric types from stored events', async () => {
    const slug = `stats-metrics-${crypto.randomUUID()}`
    slugs.push(slug)
    expect((await postJson('/api/link/create', { slug, url: 'https://example.com/metrics' })).status).toBe(201)
    expect((await fetch(`/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).status).toBe(301)

    await expect.poll(async () => {
      const response = await fetchWithAuth(`/api/stats/metrics?slug=${slug}&type=url`)
      expect(response.status).toBe(200)
      const data = await response.json() as { data: Array<{ name: string, count: number }> }
      return data.data
    }).toEqual([expect.objectContaining({ name: 'https://example.com/metrics', count: 1 })])

    await expect.poll(async () => {
      const response = await fetchWithAuth(`/api/stats/metrics?slug=${slug}&type=ua`)
      expect(response.status).toBe(200)
      const data = await response.json() as { data: Array<{ name: string, count: number }> }
      return data.data
    }).toEqual([expect.objectContaining({ name: 'Mozilla/5.0', count: 1 })])

    await expect.poll(async () => {
      const response = await fetchWithAuth(`/api/stats/metrics?slug=${slug}&type=latitude`)
      expect(response.status).toBe(200)
      const data = await response.json() as { data: Array<{ name: unknown, count: number }> }
      return data.data
    }).toEqual([expect.objectContaining({ count: 1 })])
  })

  it.each(['invalid', 'colo'])('returns 400 for the non-allowlisted %s metric type', async (type) => {
    const response = await fetchWithAuth(`/api/stats/metrics?slug=0&type=${type}`)

    expect(response.status).toBe(400)
  })

  it('returns 400 when type parameter is missing', async () => {
    const response = await fetchWithAuth('/api/stats/metrics?slug=0')

    expect(response.status).toBe(400)
  })
})

describe('/api/stats/views', () => {
  it('returns views data with valid auth and unit', async () => {
    const response = await fetchWithAuth('/api/stats/views?slug=0&unit=day')

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('data')
  })

  it.each(['minute', 'hour'])('accepts the %s view unit', async (unit) => {
    const response = await fetchWithAuth(`/api/stats/views?slug=0&unit=${unit}`)
    expect(response.status).toBe(200)
  })

  it('accepts an offset-style timezone', async () => {
    const response = await fetchWithAuth('/api/stats/views?slug=0&unit=day&clientTimezone=Etc/GMT-8')
    expect(response.status).toBe(200)
  })

  it('returns 400 for invalid clientTimezone format', async () => {
    const response = await fetchWithAuth('/api/stats/views?slug=0&unit=day&clientTimezone=invalid<>timezone')

    expect(response.status).toBe(400)
  })

  it('returns 400 for invalid unit', async () => {
    const response = await fetchWithAuth('/api/stats/views?slug=0&unit=invalid')

    expect(response.status).toBe(400)
  })

  it('returns 400 when unit parameter is missing', async () => {
    const response = await fetchWithAuth('/api/stats/views?slug=0')

    expect(response.status).toBe(400)
  })
})

describe('/api/stats/heatmap', () => {
  it('supports clientTimezone parameter', async () => {
    const response = await fetchWithAuth('/api/stats/heatmap?clientTimezone=Asia/Shanghai')

    expect(response.status).toBe(200)
  })

  it('accepts an offset-style timezone', async () => {
    const response = await fetchWithAuth('/api/stats/heatmap?clientTimezone=Etc/GMT-8')

    expect(response.status).toBe(200)
  })

  it('returns 400 for invalid clientTimezone format', async () => {
    const response = await fetchWithAuth('/api/stats/heatmap?clientTimezone=invalid<>timezone')

    expect(response.status).toBe(400)
  })
})

describe('/api/stats/export', () => {
  it('returns CSV with valid auth', async () => {
    const response = await fetchWithAuth('/api/stats/export')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('slite-access-')

    const csv = await response.text()
    expect(csv.replace(/^\uFEFF/, '').split('\n')[0]).toBe('slug,url,viewer,views,referer')
  })

  it('returns 400 for invalid time range', async () => {
    const now = Math.floor(Date.now() / 1000)
    const response = await fetchWithAuth(`/api/stats/export?startAt=${now}&endAt=${now - 86400}`)

    expect(response.status).toBe(400)
  })
})
