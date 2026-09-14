import type { SliteDatabase } from '../../server/database/sqlite'
import { readdirSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, initializeDatabase } from '../../server/database/sqlite'
import { createV0FlatDatabase, readV0Migrations } from '../helpers/flat-sqlite'

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../../drizzle', import.meta.url))

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'slite-migration-test-'))
})

afterEach(async () => {
  closeDatabase()
  if (directory)
    await rm(directory, { recursive: true, force: true })
})

function storedMigrations(db: SliteDatabase) {
  return db.$client
    .prepare('SELECT id, hash, created_at, name, applied_at FROM __drizzle_migrations ORDER BY created_at')
    .all() as Array<{ id: number | null, hash: string, created_at: number, name: string | null, applied_at: string | null }>
}

function schemaObjects(db: SliteDatabase) {
  return db.$client
    .prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY type, name`)
    .all()
}

function tableNames(db: SliteDatabase) {
  return (db.$client.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>)
    .map(row => row.name)
}

// drizzle-kit v1 sorts migration folders by name, so the six local folders are
// the five converted flat migrations plus the cleanup migration.
function localMigrationNames() {
  return readdirSync(MIGRATIONS_DIRECTORY, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

describe('sqlite migrations', () => {
  it('only creates the connection through initializeDatabase', () => {
    expect(() => getDatabase()).toThrow('SQLite is not initialized')
    const db = initializeDatabase(directory)
    expect(getDatabase()).toBe(db)
    closeDatabase()
    expect(() => getDatabase()).toThrow('SQLite is not initialized')
  })

  it('creates a missing data directory owner-only and leaves existing directories untouched', async () => {
    const missing = join(directory, 'created')
    initializeDatabase(missing)
    expect((await stat(missing)).mode & 0o777).toBe(0o700)
    closeDatabase()

    const existing = join(directory, 'existing')
    await mkdir(existing, { recursive: true })
    await chmod(existing, 0o755)
    initializeDatabase(existing)
    expect((await stat(existing)).mode & 0o777).toBe(0o755)
  })

  it('configures the connection before running migrations', () => {
    const db = initializeDatabase(directory)
    expect(db.$client.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' })
    expect(db.$client.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 })
    expect(db.$client.prepare('PRAGMA synchronous').get()).toMatchObject({ synchronous: 2 })
    expect(db.$client.prepare('PRAGMA busy_timeout').get()).toMatchObject({ timeout: 5000 })
  })

  it('creates the final schema and metadata for an empty database', async () => {
    const migrations = localMigrationNames()
    expect(migrations.length).toBeGreaterThanOrEqual(6)
    const db = initializeDatabase(directory)
    expect(tableNames(db)).toEqual(expect.arrayContaining(['__drizzle_migrations', 'link_tags', 'links', 'tags']))
    expect(tableNames(db)).not.toEqual(expect.arrayContaining(['link_migration_runs', 'link_tombstones']))
    const stored = storedMigrations(db)
    expect(stored).toHaveLength(migrations.length)
    expect(stored.map(row => row.name)).toEqual(migrations)
    expect(stored.every(row => row.applied_at !== null)).toBe(true)
  })

  it('keeps the v0 fixture faithful to the flat migrations shipped in git HEAD', async () => {
    const migrations = await readV0Migrations()
    expect(migrations.map(migration => migration.tag)).toEqual([
      '0000_workable_killraven',
      '0001_parched_strong_guy',
      '0002_chilly_aaron_stack',
      '0003_hesitant_namora',
      '0004_quiet_lionheart',
    ])
    // Real journal timestamps that drizzle-orm 0.x recorded as created_at.
    expect(migrations.map(migration => migration.when)).toEqual([
      1783782935271,
      1783784817546,
      1783821450112,
      1784369840025,
      1786005047738,
    ])
  })

  it('upgrades a v0 flat-migration database to the current schema without rerunning migrations', async () => {
    const migrations = await readV0Migrations()
    createV0FlatDatabase(join(directory, 'slite.sqlite'), migrations, {
      links: [{ slug: 'v0-link', id: 'v0-id-01', url: 'https://example.com/v0', tags: ['legacy'] }],
      tombstones: [{ slug: 'retired-link', deletedAt: 1783782935271 }],
      migrationRuns: [{ id: 'v0-run-01', status: 'completed', createdAt: 1783782935271, updatedAt: 1783782935271 }],
    })

    const db = initializeDatabase(directory)
    const stored = storedMigrations(db)

    // The old rows are matched by journal second, backfilled with the v3 folder
    // names, and the cleanup migration is appended; nothing is applied twice.
    expect(stored.slice(0, 5).map(row => row.name)).toEqual(localMigrationNames().slice(0, 5))
    expect(stored.slice(0, 5).map(row => [row.hash, row.created_at])).toEqual(
      migrations.map(migration => [migration.hash, migration.when]),
    )
    expect(stored.slice(0, 5).every(row => row.applied_at === null)).toBe(true)
    // drizzle-orm 0.x inserted without an id, so SERIAL PRIMARY KEY left NULLs.
    expect(stored.slice(0, 5).every(row => row.id === null)).toBe(true)
    expect(stored).toHaveLength(localMigrationNames().length)

    // Deprecated structures are dropped and the link data survives.
    expect(tableNames(db)).not.toEqual(expect.arrayContaining(['link_migration_runs', 'link_tombstones']))
    expect(db.$client.prepare('SELECT slug, id, url FROM links WHERE slug = ?').get('v0-link'))
      .toMatchObject({ slug: 'v0-link', id: 'v0-id-01', url: 'https://example.com/v0' })
    expect(db.$client.prepare('SELECT tag_name FROM link_tags WHERE link_slug = ?').all('v0-link'))
      .toEqual([{ tag_name: 'legacy' }])

    // Old links stay readable and writable through the current schema.
    db.$client.prepare('UPDATE links SET url = ? WHERE slug = ?').run('https://example.com/updated', 'v0-link')
    db.$client.prepare(`INSERT INTO links (slug, id, url, created_at, updated_at, normalized_url) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('post-upgrade', 'post-id-01', 'https://example.com/new', 1, 1, 'https://example.com/new')
    expect(db.$client.prepare('SELECT url FROM links WHERE slug = ?').get('v0-link'))
      .toMatchObject({ url: 'https://example.com/updated' })
  })

  it('produces the same final schema for an empty and an upgraded database', async () => {
    const migrations = await readV0Migrations()
    const v0Directory = await mkdtemp(join(tmpdir(), 'slite-v0-upgrade-'))
    try {
      createV0FlatDatabase(join(v0Directory, 'slite.sqlite'), migrations, {
        links: [{ slug: 'v0-link', id: 'v0-id-01', url: 'https://example.com/v0' }],
      })
      const upgraded = schemaObjects(initializeDatabase(v0Directory))
      closeDatabase()
      const fresh = schemaObjects(initializeDatabase(directory))
      expect(upgraded).toEqual(fresh)
    }
    finally {
      closeDatabase()
      await rm(v0Directory, { recursive: true, force: true })
    }
  })

  it('skips applied migrations when the database is reopened', async () => {
    const migrations = await readV0Migrations()
    createV0FlatDatabase(join(directory, 'slite.sqlite'), migrations, {
      links: [{ slug: 'v0-link', id: 'v0-id-01', url: 'https://example.com/v0' }],
    })
    const first = storedMigrations(initializeDatabase(directory))
    closeDatabase()

    const reopened = initializeDatabase(directory)
    expect(storedMigrations(reopened)).toEqual(first)
    expect(reopened.$client.prepare('SELECT url FROM links WHERE slug = ?').get('v0-link'))
      .toMatchObject({ url: 'https://example.com/v0' })
  })
})
