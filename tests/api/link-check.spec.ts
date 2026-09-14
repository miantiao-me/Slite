import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { LinkCheckResponse, LinkCheckResult } from '../../shared/types/link-check'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { deleteStoredLinks, expireStoredLink, postJson, useTestServer } from '../utils'

useTestServer()

function uniqueSlug(index: number): string {
  return `link-check-${index}-${crypto.randomUUID()}`
}

async function createStoredLinks(
  count: number,
  url: (index: number) => string = index => `http://localhost/link-check/${index}`,
): Promise<{ slug: string, url: string }[]> {
  const links = Array.from({ length: count }, (_, index) => ({
    slug: uniqueSlug(index),
    url: url(index),
  }))
  for (const link of links)
    expect((await postJson('/api/link/create', link)).status).toBe(201)
  return links
}

async function findCheckResults(slugs: string[]): Promise<Map<string, LinkCheckResult>> {
  const wanted = new Set(slugs)
  const found = new Map<string, LinkCheckResult>()
  let cursor: string | undefined

  for (let pageCount = 0; pageCount < 100; pageCount++) {
    const response = await postJson('/api/link/check', { cursor, limit: 10, timeout: 1 })
    expect(response.status).toBe(200)
    const page = await response.json() as LinkCheckResponse
    for (const result of page.results) {
      if (wanted.has(result.slug))
        found.set(result.slug, result)
    }

    if (found.size === wanted.size || page.list_complete)
      break
    cursor = page.cursor
  }

  return found
}

describe('/api/link/check', { concurrent: false }, () => {
  it('checks authoritative links with keyset cursor pagination', async () => {
    const created = await createStoredLinks(11)

    try {
      const checked = new Map<string, string>()
      const checkedSlugs: string[] = []
      let cursor: string | undefined
      let pageCount = 0

      do {
        const response = await postJson('/api/link/check', { cursor, limit: 10, timeout: 1 })
        expect(response.status).toBe(200)
        const page = await response.json() as LinkCheckResponse
        expect(page.results.length).toBeLessThanOrEqual(10)
        for (const result of page.results) {
          expect(checked.has(result.slug)).toBe(false)
          checked.set(result.slug, result.url)
          checkedSlugs.push(result.slug)
        }
        cursor = page.cursor
        pageCount++
        if (page.list_complete)
          break
        expect(cursor).toBeTypeOf('string')
      } while (pageCount < 100)

      expect(pageCount).toBeGreaterThan(1)
      expect(checkedSlugs).toEqual([...checkedSlugs].sort((a, b) => a.localeCompare(b)))
      for (const link of created)
        expect(checked.get(link.slug)).toBe(link.url)
    }
    finally {
      await deleteStoredLinks(created.map(link => link.slug))
    }
  })

  it('includes expired links and checks their stored URL', async () => {
    const [link] = await createStoredLinks(1)
    if (!link)
      throw new Error('Missing link fixture')
    await expireStoredLink(link.slug)

    try {
      let cursor: string | undefined
      let result
      for (let pageCount = 0; pageCount < 100 && !result; pageCount++) {
        const response = await postJson('/api/link/check', { cursor, limit: 10, timeout: 1 })
        expect(response.status).toBe(200)
        const page = await response.json() as LinkCheckResponse
        result = page.results.find(item => item.slug === link.slug)
        if (page.list_complete)
          break
        cursor = page.cursor
      }

      expect(result).toMatchObject({
        slug: link.slug,
        url: link.url,
        status: 0,
        ok: false,
        error: 'URL is not allowed for server-side checking',
      })
    }
    finally {
      await deleteStoredLinks([link.slug])
    }
  })

  it('rejects local, link-local, and loopback targets without connecting', async () => {
    let privateHits = 0
    const privateTarget = createServer((_request: IncomingMessage, response: ServerResponse) => {
      privateHits++
      response.end('secret')
    })
    privateTarget.listen(0, '127.0.0.1')
    await once(privateTarget, 'listening')
    const { port } = privateTarget.address() as AddressInfo

    const created = await createStoredLinks(3, index => [
      `http://127.0.0.1:${port}/private-${index}`,
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/private',
    ][index]!)

    try {
      const results = await findCheckResults(created.map(link => link.slug))
      expect(results.size).toBe(created.length)
      for (const link of created) {
        expect(results.get(link.slug)).toMatchObject({
          slug: link.slug,
          url: link.url,
          status: 0,
          ok: false,
          error: 'URL is not allowed for server-side checking',
        })
      }
      expect(privateHits).toBe(0)
    }
    finally {
      await deleteStoredLinks(created.map(link => link.slug))
      privateTarget.closeAllConnections()
      await new Promise<void>((resolve, reject) => privateTarget.close(error => error ? reject(error) : resolve()))
    }
  })

  it('rejects client-provided link targets and limits pages to 10', async () => {
    expect((await postJson('/api/link/check', {
      links: [{ slug: 'client-target', url: 'https://example.com' }],
    })).status).toBe(400)
    expect((await postJson('/api/link/check', { limit: 11 })).status).toBe(400)
  })
})
