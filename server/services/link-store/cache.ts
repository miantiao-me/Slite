import type { LRUCache } from 'lru-cache'
import type { Storage } from 'unstorage'
import type { Link } from '#shared/schemas/link'
import { createStorage } from 'unstorage'
import lruCacheDriver from 'unstorage/drivers/lru-cache'

export interface CachedLink {
  link: Link
  effectiveExpiresAt: number | null
}

type LinkCache = LRUCache<string, CachedLink>

const CACHE_MAX_ENTRIES = 1000

let storage: Storage<CachedLink> | undefined
let cache: LinkCache | undefined
let disabled = false

// The cache starts empty in every process, so it is always a rebuildable
// read-through layer over SQLite. Its LRU instance is used directly because
// cache reads, writes, and invalidations must stay synchronous with SQLite
// commits: the async storage API would let a read that started before a commit
// repopulate the value invalidated by that commit.
function disableCache(error: unknown) {
  storage = undefined
  cache = undefined
  if (disabled)
    return
  disabled = true
  console.warn('Link cache disabled; continuing with SQLite.', error)
}

function withCache<T>(operation: (cache: LinkCache) => T): T | undefined {
  if (!cache)
    return undefined
  try {
    return operation(cache)
  }
  catch (error) {
    disableCache(error)
    return undefined
  }
}

export function initializeLinkCache(): void {
  if (storage || disabled)
    return
  try {
    const driver = lruCacheDriver({ max: CACHE_MAX_ENTRIES })
    const instance = driver.getInstance?.()
    if (!instance)
      throw new Error('unstorage lru-cache driver did not expose an LRUCache instance')
    storage = createStorage<CachedLink>({ driver })
    cache = instance
  }
  catch (error) {
    disableCache(error)
  }
}

export function getCachedLink(slug: string): CachedLink | undefined {
  return withCache((cache) => {
    const stored = cache.get(slug)
    if (stored && (stored.effectiveExpiresAt === null || stored.effectiveExpiresAt > Math.floor(Date.now() / 1000)))
      return stored
  })
}

export function putCachedLink(slug: string, stored: CachedLink): void {
  withCache((cache) => {
    if (stored.effectiveExpiresAt === null) {
      cache.set(slug, stored)
      return
    }
    const ttl = stored.effectiveExpiresAt * 1000 - Date.now()
    if (ttl > 0)
      cache.set(slug, stored, { ttl })
    else
      cache.delete(slug)
  })
}

export function invalidateCachedLink(slug: string): void {
  withCache(cache => cache.delete(slug))
}

export async function closeLinkCache(): Promise<void> {
  const current = storage
  storage = undefined
  cache = undefined
  if (!current)
    return
  try {
    await current.dispose()
  }
  catch (error) {
    disableCache(error)
  }
}
