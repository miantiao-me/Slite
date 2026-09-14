import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createV0FlatDatabase, readV0Migrations } from '../helpers/flat-sqlite'
import { TestServer } from '../helpers/server'

const LOCAL_MIGRATIONS = readdirSync(fileURLToPath(new URL('../../drizzle', import.meta.url)), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

interface MigrationRow {
  id: number | null
  hash: string
  created_at: number
  name: string | null
  applied_at: string | null
}

function readMigrationRows(dataDir: string) {
  const db = new DatabaseSync(join(dataDir, 'slite.sqlite'))
  try {
    return db
      .prepare('SELECT id, hash, created_at, name, applied_at FROM __drizzle_migrations ORDER BY created_at')
      .all() as unknown as MigrationRow[]
  }
  finally {
    db.close()
  }
}

function readTableNames(dataDir: string) {
  const db = new DatabaseSync(join(dataDir, 'slite.sqlite'))
  try {
    return (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as unknown as Array<{ name: string }>)
      .map(row => row.name)
  }
  finally {
    db.close()
  }
}

const v0Server = new TestServer()
const emptyServer = new TestServer()

beforeAll(async () => {
  const migrations = await readV0Migrations()
  v0Server.dataDir = await mkdtemp(join(tmpdir(), 'slite-v0-flat-'))
  v0Server.token = 'slite-v0-test-token'
  createV0FlatDatabase(join(v0Server.dataDir, 'slite.sqlite'), migrations, {
    links: [{ slug: 'v0-start', id: 'v0-id-01', url: 'https://example.com/v0', tags: ['v0-tag'] }],
    tombstones: [{ slug: 'v0-retired', deletedAt: 1783782935271 }],
    migrationRuns: [{ id: 'v0-run-01', status: 'completed', createdAt: 1783782935271, updatedAt: 1783782935271 }],
  })
  await v0Server.start()

  emptyServer.dataDir = await mkdtemp(join(tmpdir(), 'slite-v1-empty-'))
  emptyServer.token = 'slite-empty-test-token'
  await emptyServer.start()
})

afterAll(async () => {
  await v0Server.dispose()
  await emptyServer.dispose()
})

describe('v0 flat-migration database upgrade', () => {
  it('starts without missing migrations and backfills all five records', () => {
    expect(v0Server.logs).not.toContain('do not match any local migration')
    const rows = readMigrationRows(v0Server.dataDir)
    expect(LOCAL_MIGRATIONS).toHaveLength(6)
    expect(rows).toHaveLength(LOCAL_MIGRATIONS.length)
    expect(rows.slice(0, 5).map(row => row.name)).toEqual([
      '20260711151535_workable_killraven',
      '20260711154657_parched_strong_guy',
      '20260712015730_chilly_aaron_stack',
      '20260718101720_hesitant_namora',
      '20260806083047_quiet_lionheart',
    ])
    expect(rows.slice(0, 5).every(row => row.applied_at === null)).toBe(true)
    expect(rows.slice(0, 5).map(row => row.created_at)).toEqual([
      1783782935271,
      1783784817546,
      1783821450112,
      1784369840025,
      1786005047738,
    ])
    expect(rows[5].name).toBe(LOCAL_MIGRATIONS[5])
    expect(rows[5].applied_at).not.toBeNull()
  })

  it('keeps old links readable, writable, and servable', async () => {
    const queried = await fetch(`${v0Server.url}/api/link/query?slug=v0-start`, {
      headers: { Authorization: `Bearer ${v0Server.token}` },
    })
    expect(queried.status).toBe(200)
    expect(await queried.json()).toMatchObject({ slug: 'v0-start', url: 'https://example.com/v0', tags: ['v0-tag'] })

    const edited = await fetch(`${v0Server.url}/api/link/edit`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${v0Server.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'v0-start', url: 'https://example.com/v0-edited' }),
    })
    expect(edited.status).toBe(201)

    const redirect = await fetch(`${v0Server.url}/v0-start`, { redirect: 'manual' })
    expect(redirect.status).toBe(301)
    expect(redirect.headers.get('location')).toBe('https://example.com/v0-edited')
  })

  it('drops deprecated tables and keeps migration bookkeeping stable across restarts', async () => {
    const before = readMigrationRows(v0Server.dataDir)
    expect(readTableNames(v0Server.dataDir)).not.toEqual(expect.arrayContaining(['link_migration_runs', 'link_tombstones']))

    await v0Server.restart()
    expect(v0Server.logs).not.toContain('do not match any local migration')
    expect(readMigrationRows(v0Server.dataDir)).toEqual(before)

    const queried = await fetch(`${v0Server.url}/api/link/query?slug=v0-start`, {
      headers: { Authorization: `Bearer ${v0Server.token}` },
    })
    expect(await queried.json()).toMatchObject({ url: 'https://example.com/v0-edited' })
    expect(existsSync(join(v0Server.dataDir, '.migrations'))).toBe(false)
  })
})

describe('empty data directory', () => {
  it('applies every migration exactly once and survives a restart', async () => {
    expect(emptyServer.logs).not.toContain('do not match any local migration')
    const rows = readMigrationRows(emptyServer.dataDir)
    expect(rows.map(row => row.name)).toEqual(LOCAL_MIGRATIONS)
    expect(rows.every(row => row.applied_at !== null)).toBe(true)
    expect(readTableNames(emptyServer.dataDir)).not.toEqual(expect.arrayContaining(['link_migration_runs', 'link_tombstones']))

    await emptyServer.restart()
    expect(readMigrationRows(emptyServer.dataDir)).toEqual(rows)
  })
})
