import { afterAll, describe, expect, it } from 'vitest'
import { deleteStoredLinks, fetch, fetchWithAuth, postJson, useTestServer } from '../utils'

useTestServer()
const slugs: string[] = []
afterAll(async () => deleteStoredLinks(slugs))

async function json(path: string) {
  const response = await fetchWithAuth(path)
  expect(response.status).toBe(200)
  return response.json()
}

describe('redirect analytics in DuckDB', () => {
  it('filters actual events and aggregates visits without fabricated geography', async () => {
    const start = Math.floor(Date.now() / 1000) - 1
    const first = `analytics-a-${crypto.randomUUID()}`
    const second = `analytics-b-${crypto.randomUUID()}`
    slugs.push(first, second)
    for (const slug of slugs)
      expect((await postJson('/api/link/create', { slug, url: `https://example.com/${slug}` })).status).toBe(201)
    for (const slug of [first, first, second]) {
      const response = await fetch(`/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://referrer.example/test', 'CF-IPCountry': 'CN' } })
      expect(response.status).toBe(301)
    }
    await expect.poll(async () => (await json(`/api/logs/events?slug=${first}`)).length).toBe(2)
    const end = Math.floor(Date.now() / 1000) + 1
    const events = await json(`/api/logs/events?slug=${first}&startAt=${start}&endAt=${end}`)
    expect(events).toHaveLength(2)
    expect(new Set(events.map((event: { id: string }) => event.id)).size).toBe(2)
    for (const event of events) {
      expect(event.slug).toBe(first)
      expect(event.country || '').toBe('')
      expect(event.timestamp).toBeGreaterThanOrEqual(start)
      expect(event.timestamp).toBeLessThanOrEqual(end)
      expect(event).not.toHaveProperty('ip')
    }
    expect(await json(`/api/logs/events?slug=${first}&limit=1`)).toHaveLength(1)
    expect(await json(`/api/logs/events?slug=${first}&country=CN`)).toEqual([])
    expect(await json(`/api/logs/events?slug=${first}&startAt=${end + 10}&endAt=${end + 20}`)).toEqual([])
    const counters = await json(`/api/stats/counters?slug=${first}&startAt=${start}&endAt=${end}`)
    expect(counters.data).toEqual([expect.objectContaining({ visits: 2, visitors: 1, referers: 1 })])
    const other = await json(`/api/stats/counters?slug=${second}`)
    expect(other.data).toEqual([expect.objectContaining({ visits: 1 })])
    const views = await json(`/api/stats/views?slug=${first}&unit=hour&startAt=${start}&endAt=${end}`)
    expect(views.data.reduce((sum: number, row: { visits: number }) => sum + row.visits, 0)).toBe(2)
    const metrics = await json(`/api/stats/metrics?slug=${first}&type=referer`)
    expect(metrics.data).toContainEqual(expect.objectContaining({ count: 2 }))
    const injection = encodeURIComponent(`${first}'); DROP TABLE access_events; --`)
    expect(await json(`/api/logs/events?slug=${injection}`)).toEqual([])
    expect(await json(`/api/logs/events?slug=${first}`)).toHaveLength(2)
  })
})
