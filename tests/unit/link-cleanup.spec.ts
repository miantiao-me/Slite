import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { links, linkTags, tags } from '../../server/database/schema'
import { closeDatabase, getDatabase, initializeDatabase } from '../../server/database/sqlite'
import { closeLinkCache, getCachedLink, initializeLinkCache, putCachedLink } from '../../server/services/link-store/cache'
import { cleanupExpiredLinks, startAutomaticLinkCleanup, stopAutomaticLinkCleanup } from '../../server/utils/link-cleanup'

const now = 1800000000
const day = 86400
let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'slite-cleanup-test-'))
  initializeDatabase(directory)
  initializeLinkCache()
  vi.useFakeTimers()
  vi.setSystemTime(now * 1000)
})

afterEach(async () => {
  stopAutomaticLinkCleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await closeLinkCache()
  closeDatabase()
  await rm(directory, { recursive: true, force: true })
})

function seed(expiration: number | null): string {
  const slug = crypto.randomUUID()
  getDatabase().insert(links).values({
    slug,
    id: slug,
    url: 'https://example.com',
    normalizedUrl: 'https://example.com',
    createdAt: now - 60 * day,
    updatedAt: now,
    effectiveExpiresAt: expiration,
  }).run()
  return slug
}

describe('expired link cleanup', () => {
  it.each([undefined, null, '', ' ', '-1', '1.5', 'invalid', 'Infinity', true, '9007199254740991'])('skips disabled or invalid retention %s', (value) => {
    seed(now - 60 * day)
    expect(cleanupExpiredLinks(value)).toBe(0)
    expect(getDatabase().select().from(links).all()).toHaveLength(1)
    startAutomaticLinkCleanup(value)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('deletes across batches at the retention boundary and cascades tag associations', () => {
    const db = getDatabase()
    const expired = Array.from({ length: 101 }, () => seed(now - 30 * day))
    const kept = [now - 30 * day + 1, now - 1, now + day, null].map(seed)
    db.insert(tags).values({ name: 'cleanup' }).run()
    db.insert(linkTags).values([
      { linkSlug: expired[0]!, tagName: 'cleanup' },
      { linkSlug: kept[0]!, tagName: 'cleanup' },
    ]).run()
    expect(cleanupExpiredLinks('30')).toBe(101)
    expect(db.select().from(links).all().map(row => row.slug).sort()).toEqual([...kept].sort())
    expect(db.select().from(linkTags).all()).toEqual([{ linkSlug: kept[0], tagName: 'cleanup' }])
    expect(cleanupExpiredLinks('30')).toBe(0)
  })

  it('invalidates cached records after deletion and preserves active and permanent links', () => {
    const expired = seed(now)
    seed(now + 1)
    seed(null)
    putCachedLink(expired, {
      link: { slug: expired, id: expired, url: 'https://example.com', createdAt: now, updatedAt: now, tags: [] },
      effectiveExpiresAt: null,
    })
    expect(getCachedLink(expired)).toBeDefined()
    expect(cleanupExpiredLinks(0)).toBe(1)
    expect(getCachedLink(expired)).toBeUndefined()
    expect(getDatabase().select().from(links).all()).toHaveLength(2)
  })

  it('runs daily without duplicate timers and stops on shutdown', () => {
    seed(now - day)
    startAutomaticLinkCleanup('0')
    startAutomaticLinkCleanup('0')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(day * 1000 - 1)
    expect(getDatabase().select().from(links).all()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(getDatabase().select().from(links).all()).toHaveLength(0)
    stopAutomaticLinkCleanup()
    seed(now)
    vi.advanceTimersByTime(day * 1000)
    expect(getDatabase().select().from(links).all()).toHaveLength(1)
  })
})
