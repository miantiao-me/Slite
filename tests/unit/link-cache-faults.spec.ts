import type { H3Event } from 'h3'
import type { Link } from '../../shared/schemas/link'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type CacheOperation = 'get' | 'set' | 'delete'

const state = vi.hoisted(() => ({
  fail: null as CacheOperation | null,
  created: 0,
  calls: { get: 0, set: 0, delete: 0 },
  entries: new Map<string, unknown>(),
}))

vi.mock('unstorage/drivers/lru-cache', () => ({
  default: () => {
    state.created++
    return {
      name: 'lru-cache',
      getInstance: () => ({
        get(key: string) {
          state.calls.get++
          if (state.fail === 'get')
            throw new Error('get failed')
          return state.entries.get(key)
        },
        set(key: string, value: unknown) {
          state.calls.set++
          if (state.fail === 'set')
            throw new Error('set failed')
          state.entries.set(key, value)
        },
        delete(key: string) {
          state.calls.delete++
          if (state.fail === 'delete')
            throw new Error('delete failed')
          return state.entries.delete(key)
        },
        clear() {
          state.entries.clear()
        },
      }),
    }
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('link cache failures fall back to real SQLite', () => {
  it.each(['get', 'set', 'delete'] as const)('disables cache for the process after %s fails', async (operation) => {
    vi.resetModules()
    state.fail = null
    state.created = 0
    state.calls = { get: 0, set: 0, delete: 0 }
    state.entries.clear()
    const directory = await mkdtemp(join(tmpdir(), 'slite-cache-fault-'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { previewMode: false } }))
    const database = await import('../../server/database/sqlite')
    const caching = await import('../../server/services/link-store/cache')
    const store = await import('../../server/utils/link-store')
    const event = {} as H3Event
    const link: Link = { id: 'fault-id', slug: 'fault-slug', url: 'https://example.com', createdAt: 1, updatedAt: 1, tags: ['original'] }
    try {
      database.initializeDatabase(directory)
      caching.initializeLinkCache()
      await store.createLink(event, link)
      state.fail = operation
      const winner = { ...link, updatedAt: 2, tags: ['winner'] }
      if (operation === 'delete')
        expect(await store.updateLink(event, winner, link)).toBe(true)
      else
        expect(await store.getLink(event, link.slug)).toEqual(link)
      expect(warning).toHaveBeenCalledTimes(1)
      const calls = { ...state.calls }
      expect(await store.updateLink(event, winner)).toBe(true)
      expect(await store.getLink(event, link.slug)).toEqual(winner)
      expect(await store.listTags(event)).toEqual([{ name: 'winner', count: 1 }])
      await store.deleteLink(event, link.slug)
      expect(await store.getLink(event, link.slug)).toBeNull()
      await caching.closeLinkCache()
      caching.initializeLinkCache()
      expect(state.created).toBe(1)
      expect(await store.createLink(event, link)).toBe(true)
      expect(await store.getLink(event, link.slug)).toEqual(link)
      expect(state.calls).toEqual(calls)
    }
    finally {
      await caching.closeLinkCache()
      database.closeDatabase()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
