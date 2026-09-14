import type { H3Event } from 'h3'
import type { Link } from '../../shared/schemas/link'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, initializeDatabase } from '../../server/database/sqlite'
import { sqliteCreateLink, sqliteDeleteLink, sqliteGetAnyLink, sqliteSnapshotAllLinks, sqliteUpdateLink } from '../../server/services/link-store/sqlite'

let directory = ''
const event = {} as H3Event

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'slite-sqlite-test-'))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { previewMode: false } }))
  initializeDatabase(directory)
})

afterEach(async () => {
  closeDatabase()
  vi.unstubAllGlobals()
  if (directory)
    await rm(directory, { recursive: true, force: true })
})

function fixture(): Link {
  const now = Math.floor(Date.now() / 1000)
  return { id: 'original01', slug: `version-${crypto.randomUUID()}`, url: 'https://example.com/original', createdAt: now, updatedAt: now, tags: ['original'] }
}

describe('sqlite optimistic updates', () => {
  it('rejects a stale version without overwriting the winner or its tags', async () => {
    const link = fixture()
    expect((await sqliteCreateLink(event, link)).created).toBe(true)
    const winner = { ...link, updatedAt: link.updatedAt + 1, url: 'https://example.com/winner', tags: ['winner'] }
    expect((await sqliteUpdateLink(event, winner, link)).updated).toBe(true)
    expect((await sqliteUpdateLink(event, { ...link, tags: ['stale'] }, link)).updated).toBe(false)
    expect(await sqliteGetAnyLink(event, link.slug)).toEqual(winner)
  })

  it('rejects a stale identity after delete and recreation with the same slug', async () => {
    const link = fixture()
    await sqliteCreateLink(event, link)
    await sqliteDeleteLink(event, link.slug)
    const replacement = { ...link, id: 'replaced01', tags: ['replacement'] }
    await sqliteCreateLink(event, replacement)
    expect((await sqliteUpdateLink(event, link, link)).updated).toBe(false)
    expect(await sqliteGetAnyLink(event, link.slug)).toEqual(replacement)
  })

  it('rolls back link and tag changes when a transaction fails', async () => {
    const link = fixture()
    await sqliteCreateLink(event, link)
    const invalid = { ...link, url: 'https://example.com/rollback', tags: [null as unknown as string] }
    expect(() => sqliteUpdateLink(event, invalid, link)).toThrow()
    expect(await sqliteGetAnyLink(event, link.slug)).toEqual(link)
  })
})

describe('sqlite backup snapshot', () => {
  it('returns every link with its tags from one transaction', async () => {
    const first = fixture()
    const second = fixture()
    await sqliteCreateLink(event, first)
    await sqliteCreateLink(event, second)

    const snapshot = sqliteSnapshotAllLinks()
    const expected = [first, second].sort((a, b) => (a.slug < b.slug ? -1 : 1))
    expect(snapshot).toEqual(expected)
  })
})
