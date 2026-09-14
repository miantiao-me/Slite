import type { H3Event } from 'h3'
import type { CachedLink } from '../../server/services/link-store/cache'
import type { Link } from '../../shared/schemas/link'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, initializeDatabase } from '../../server/database/sqlite'
import { closeLinkCache, getCachedLink, initializeLinkCache, putCachedLink } from '../../server/services/link-store/cache'
import * as sqlite from '../../server/services/link-store/sqlite'
import { createLink, deleteLink, getLink, listTags, updateLink } from '../../server/utils/link-store'

let directory = ''
const event = {} as H3Event
function fixture(): Link {
  return { id: crypto.randomUUID(), slug: crypto.randomUUID(), url: 'https://example.com/old', createdAt: 100, updatedAt: 100, tags: ['old'] }
}

function cachedFixture(slug: string): CachedLink {
  return { link: { ...fixture(), slug }, effectiveExpiresAt: null }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'slite-cache-test-'))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { previewMode: false } }))
  initializeDatabase(directory)
  initializeLinkCache()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await closeLinkCache()
  closeDatabase()
  await rm(directory, { recursive: true, force: true })
})

describe('in-memory link cache with authoritative SQLite', () => {
  it('fills misses, serves hits, and does not cache missing links', async () => {
    const link = fixture()
    await createLink(event, link)
    const read = vi.spyOn(sqlite, 'sqliteGetActiveLink')
    expect(getCachedLink(link.slug)).toBeUndefined()
    expect(await getLink(event, link.slug)).toEqual(link)
    expect(getCachedLink(link.slug)).toEqual({ link, effectiveExpiresAt: null })
    expect(await getLink(event, link.slug)).toEqual(link)
    expect(read).toHaveBeenCalledTimes(1)
    expect(await getLink(event, 'missing')).toBeNull()
    expect(await getLink(event, 'missing')).toBeNull()
    expect(read).toHaveBeenCalledTimes(3)
    expect(getCachedLink('missing')).toBeUndefined()
  })

  it.each([false, true])('expires at the effective boundary with preview mode %s', async (previewMode) => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { previewMode } }))
    vi.stubGlobal('useAppConfig', () => ({ previewTTL: 10 }))
    const link = { ...fixture(), expiration: 1020 }
    const effectiveExpiresAt = previewMode ? 1010 : 1020
    await createLink(event, link)
    expect(await getLink(event, link.slug)).toEqual(link)
    expect(getCachedLink(link.slug)?.effectiveExpiresAt).toBe(effectiveExpiresAt)
    vi.spyOn(Date, 'now').mockReturnValue((effectiveExpiresAt - 1) * 1000)
    expect(await getLink(event, link.slug)).toEqual(link)
    vi.spyOn(Date, 'now').mockReturnValue(effectiveExpiresAt * 1000)
    expect(getCachedLink(link.slug)).toBeUndefined()
    expect(await getLink(event, link.slug)).toBeNull()
  })

  it('applies per-entry TTL from effectiveExpiresAt and never stores an already-expired link', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    putCachedLink('permanent', cachedFixture('permanent'))
    putCachedLink('future', { ...cachedFixture('future'), effectiveExpiresAt: 1005 })
    putCachedLink('expired', { ...cachedFixture('expired'), effectiveExpiresAt: 999 })
    expect(getCachedLink('permanent')?.link.slug).toBe('permanent')
    expect(getCachedLink('future')?.link.slug).toBe('future')
    expect(getCachedLink('expired')).toBeUndefined()
    putCachedLink('future', { ...cachedFixture('future'), effectiveExpiresAt: 999 })
    expect(getCachedLink('future')).toBeUndefined()
  })

  it('bounds the cache at 1000 entries and evicts the least recently used', () => {
    for (let index = 0; index <= 1000; index++)
      putCachedLink(`slug-${index}`, cachedFixture(`slug-${index}`))
    expect(getCachedLink('slug-0')).toBeUndefined()
    expect(getCachedLink('slug-1')?.link.slug).toBe('slug-1')
    putCachedLink('slug-1001', cachedFixture('slug-1001'))
    expect(getCachedLink('slug-2')).toBeUndefined()
    expect(getCachedLink('slug-1')?.link.slug).toBe('slug-1')
  })

  it.each([
    ['update', false],
    ['update', true],
    ['delete', false],
    ['delete', true],
  ] as const)('cannot refill an old value after concurrent GET and %s (warm cache: %s)', async (operation, warm) => {
    const link = fixture()
    const winner = { ...link, url: 'https://example.com/new', updatedAt: 101, tags: ['new'] }
    await createLink(event, link)
    if (warm)
      await getLink(event, link.slug)
    const [read] = await Promise.all([
      getLink(event, link.slug),
      operation === 'update' ? updateLink(event, winner, link) : deleteLink(event, link.slug),
    ])
    expect(read).toEqual(link)
    expect(getCachedLink(link.slug)).toBeUndefined()
    expect(await getLink(event, link.slug)).toEqual(operation === 'update' ? winner : null)
    expect(await sqlite.sqliteGetAnyLink(event, link.slug)).toEqual(operation === 'update' ? winner : null)
    expect(await listTags(event)).toEqual(operation === 'update' ? [{ name: 'new', count: 1 }] : [])
  })

  it('invalidates successful creates and updates but preserves cache and data on CAS failure', async () => {
    const link = fixture()
    putCachedLink(link.slug, { link: { ...link, tags: ['stale'] }, effectiveExpiresAt: null })
    expect(await createLink(event, link)).toBe(true)
    expect(getCachedLink(link.slug)).toBeUndefined()
    await getLink(event, link.slug)
    const winner = { ...link, updatedAt: 101, tags: ['winner'] }
    expect(await updateLink(event, winner, link)).toBe(true)
    expect(getCachedLink(link.slug)).toBeUndefined()
    await getLink(event, link.slug)
    expect(await updateLink(event, { ...link, tags: ['loser'] }, link)).toBe(false)
    expect(getCachedLink(link.slug)?.link).toEqual(winner)
    expect(await sqlite.sqliteGetAnyLink(event, link.slug)).toEqual(winner)
    expect(await listTags(event)).toEqual([{ name: 'winner', count: 1 }])
    await deleteLink(event, link.slug)
    expect(getCachedLink(link.slug)).toBeUndefined()
    expect(await getLink(event, link.slug)).toBeNull()
  })

  it('starts empty after close and never revives stale in-memory data', async () => {
    const old = fixture()
    await createLink(event, old)
    await getLink(event, old.slug)
    const winner = { ...old, updatedAt: 101, tags: ['persisted'] }
    sqlite.sqliteUpdateLink(event, winner, old)
    expect(getCachedLink(old.slug)?.link).toEqual(old)
    await closeLinkCache()
    closeDatabase()
    initializeDatabase(directory)
    initializeLinkCache()
    expect(getCachedLink(old.slug)).toBeUndefined()
    expect(await getLink(event, old.slug)).toEqual(winner)
  })
})
