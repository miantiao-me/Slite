import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteStoredLinks, expireStoredLink, fetch, fetchWithAuth, postJson, server, TEST_PNG_BYTES, useTestServer } from '../utils'

useTestServer()

describe('local persistent storage', () => {
  it('preserves links, tags, images, and analytics across a full process restart', async () => {
    const slug = `persistent-${crypto.randomUUID()}`
    const link = { slug, url: 'https://example.com/persistent', tags: ['persistent-test'] }
    try {
      expect((await postJson('/api/link/create', link)).status).toBe(201)
      const form = new FormData()
      form.append('slug', slug)
      form.append('file', new File([TEST_PNG_BYTES], 'fixture.png', { type: 'image/png' }))
      const uploaded = await fetchWithAuth('/api/upload/image', { method: 'POST', body: form })
      expect(uploaded.status).toBe(200)
      const image = await uploaded.json() as { url: string }
      expect((await fetch(`/${slug}`)).status).toBe(301)
      await expect.poll(async () => {
        const response = await fetchWithAuth(`/api/logs/events?slug=${slug}`)
        expect(response.status).toBe(200)
        return (await response.json() as unknown[]).length
      }).toBe(1)
      await server.restart()
      expect(await (await fetchWithAuth(`/api/link/query?slug=${slug}`)).json()).toMatchObject(link)
      const restored = await fetch(image.url)
      expect(restored.status).toBe(200)
      expect(new Uint8Array(await restored.arrayBuffer())).toEqual(TEST_PNG_BYTES)
      expect(await (await fetchWithAuth(`/api/logs/events?slug=${slug}`)).json()).toHaveLength(1)
      for (const file of ['slite.sqlite', 'analytics.duckdb'])
        expect((await stat(join(server.dataDir, file))).size).toBeGreaterThan(0)
    }
    finally {
      await deleteStoredLinks([slug])
    }
  })

  it('does not resolve expired links and allows replacing their slug', async () => {
    const slug = `expired-${crypto.randomUUID()}`
    try {
      expect((await postJson('/api/link/create', { slug, url: 'https://example.com/old' })).status).toBe(201)
      await expireStoredLink(slug)
      expect((await fetch(`/${slug}`)).status).toBe(404)
      const replacement = { slug, url: 'https://example.com/new' }
      expect((await postJson('/api/link/create', replacement)).status).toBe(201)
      expect((await fetch(`/${slug}`)).headers.get('location')).toBe(replacement.url)
    }
    finally {
      await deleteStoredLinks([slug])
    }
  })
})
