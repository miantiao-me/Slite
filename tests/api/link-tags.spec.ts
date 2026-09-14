import type { Link } from '../../shared/schemas/link'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeBase64Url } from '../../shared/utils/cursor'
import { deleteStoredLinks, fetchWithAuth, postJson, putJson, useTestServer } from '../utils'

useTestServer()
const slugs: string[] = []
afterEach(async () => {
  await deleteStoredLinks(slugs)
  slugs.length = 0
})

describe('sqlite tag relations and pagination', () => {
  it('normalizes, deduplicates, updates and removes tag associations', async () => {
    const slug = `tags-${crypto.randomUUID()}`
    const tag = `tag-${crypto.randomUUID().slice(0, 8)}`
    slugs.push(slug)
    const response = await postJson('/api/link/create', { slug, url: 'https://example.com', tags: [` ${tag.toUpperCase()} `, tag] })
    expect(response.status).toBe(201)
    expect((await response.json() as { link: Link }).link.tags).toEqual([tag])
    expect(await (await fetchWithAuth('/api/link/tags')).json()).toContainEqual({ name: tag, count: 1 })
    expect((await putJson('/api/link/edit', { slug, url: 'https://example.com', tags: [`${tag}-new`] })).status).toBe(201)
    const tags = await (await fetchWithAuth('/api/link/tags')).json()
    expect(tags).not.toContainEqual(expect.objectContaining({ name: tag }))
    expect(tags).toContainEqual({ name: `${tag}-new`, count: 1 })
    expect((await postJson('/api/link/delete', { slug })).status).toBe(200)
    expect(await (await fetchWithAuth('/api/link/tags')).json()).not.toContainEqual(expect.objectContaining({ name: `${tag}-new` }))
  })

  it.each(['az', 'za', 'newest', 'oldest'])('paginates tagged links without gaps using %s order', async (sort) => {
    const tag = `page-${crypto.randomUUID().slice(0, 8)}`
    for (const suffix of ['c', 'a', 'b']) {
      const slug = `${tag}-${suffix}`
      slugs.push(slug)
      expect((await postJson('/api/link/create', { slug, url: 'https://example.com', tags: [tag] })).status).toBe(201)
    }
    const seen: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 4; page++) {
      const query = new URLSearchParams({ tag, sort, limit: '1', status: 'all', ...(cursor ? { cursor } : {}) })
      const response = await fetchWithAuth(`/api/link/list?${query}`)
      expect(response.status).toBe(200)
      const data = await response.json() as { links: Link[], cursor?: string, list_complete: boolean }
      seen.push(...data.links.map(link => link.slug))
      if (data.list_complete)
        break
      expect(data.cursor).toBeTruthy()
      expect(data.cursor).not.toBe(cursor)
      cursor = data.cursor
    }
    expect(seen).toHaveLength(3)
    expect([...seen].sort()).toEqual([...slugs].sort())
    if (sort === 'az' || sort === 'za')
      expect(seen).toEqual(sort === 'az' ? [...slugs].sort() : [...slugs].sort().reverse())
  })

  it.each(['中文标签', '🚀-发布'])('paginates links tagged with %s using a UTF-8 safe cursor', async (tagPrefix) => {
    const tag = `${tagPrefix}-${crypto.randomUUID().slice(0, 8)}`
    for (const suffix of ['b', 'a']) {
      const slug = `unicode-tag-${crypto.randomUUID().slice(0, 8)}-${suffix}`
      slugs.push(slug)
      expect((await postJson('/api/link/create', { slug, url: 'https://example.com', tags: [tag] })).status).toBe(201)
    }

    const seen: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 3; page++) {
      const query = new URLSearchParams({ tag, sort: 'az', limit: '1', status: 'all', ...(cursor ? { cursor } : {}) })
      const response = await fetchWithAuth(`/api/link/list?${query}`)
      expect(response.status).toBe(200)
      const data = await response.json() as { links: Link[], cursor?: string, list_complete: boolean }
      seen.push(...data.links.map(link => link.slug))
      if (data.list_complete)
        break
      const nextCursor = data.cursor ?? ''
      expect(nextCursor).toMatch(/^sqlite:v2:[\w-]+$/)
      expect(JSON.parse(decodeBase64Url(nextCursor.slice('sqlite:v2:'.length)))).toMatchObject({ tag })
      cursor = nextCursor
    }
    expect(seen).toHaveLength(2)
  })

  it.each(['invalid-cursor', 'sqlite:v1:eyJzbHVnIjoiYSJ9', 'sqlite:v2:!!!!', 'sqlite:v2:__'])('rejects malformed pagination cursor %s with 400', async (cursor) => {
    const query = new URLSearchParams({ limit: '1', status: 'all', cursor })
    const response = await fetchWithAuth(`/api/link/list?${query}`)
    expect(response.status).toBe(400)
  })
})
