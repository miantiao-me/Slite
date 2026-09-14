import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

// The fixture is a frozen copy of the five flat migrations that shipped in git
// HEAD (drizzle/0000..0004) plus the real journal timestamps and the hashes
// drizzle-orm 0.x wrote to `__drizzle_migrations`. The old database must be
// recreated from this fixture alone; reading the current v3 migrations here
// would make upgrade verification circular.
const FIXTURE_DIRECTORY = fileURLToPath(new URL('../fixtures/v0-flat-migrations', import.meta.url))

export interface V0Migration {
  tag: string
  when: number
  hash: string
  sql: string
}

export interface V0Link {
  slug: string
  id: string
  url: string
  createdAt?: number
  updatedAt?: number
  tags?: string[]
}

export interface V0FlatDatabaseOptions {
  links?: V0Link[]
  tombstones?: Array<{ slug: string, deletedAt: number }>
  migrationRuns?: Array<{ id: string, status: string, createdAt: number, updatedAt: number }>
}

export async function readV0Migrations(): Promise<V0Migration[]> {
  const journal = JSON.parse(await readFile(join(FIXTURE_DIRECTORY, 'journal.json'), 'utf8')) as {
    entries: Array<{ tag: string, when: number, hash: string }>
  }
  const migrations: V0Migration[] = []
  for (const entry of journal.entries) {
    const sql = await readFile(join(FIXTURE_DIRECTORY, `${entry.tag}.sql`), 'utf8')
    const hash = createHash('sha256').update(sql).digest('hex')
    if (hash !== entry.hash)
      throw new Error(`Fixture migration ${entry.tag} does not match its recorded drizzle-orm 0.x hash`)
    migrations.push({ tag: entry.tag, when: entry.when, hash, sql })
  }
  return migrations
}

// Recreates the database written by the previous better-sqlite3 implementation:
// drizzle-orm 0.x ran every flat migration and recorded sha256(sql) plus the
// journal `when` timestamp in the original three-column migrations table.
export function createV0FlatDatabase(file: string, migrations: V0Migration[], options: V0FlatDatabaseOptions = {}): void {
  const db = new DatabaseSync(file)
  try {
    for (const migration of migrations) {
      for (const statement of migration.sql.split('--> statement-breakpoint'))
        db.exec(statement)
    }
    db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`)
    const recordMigration = db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
    for (const migration of migrations)
      recordMigration.run(migration.hash, migration.when)

    const now = Math.floor(Date.now() / 1000)
    const insertLink = db.prepare(`INSERT INTO links (slug, id, url, created_at, updated_at, normalized_url) VALUES (?, ?, ?, ?, ?, ?)`)
    const insertTag = db.prepare('INSERT INTO tags (name) VALUES (?)')
    const insertLinkTag = db.prepare('INSERT INTO link_tags (link_slug, tag_name) VALUES (?, ?)')
    for (const link of options.links ?? []) {
      insertLink.run(link.slug, link.id, link.url, link.createdAt ?? now, link.updatedAt ?? now, link.url)
      for (const tag of link.tags ?? []) {
        insertTag.run(tag)
        insertLinkTag.run(link.slug, tag)
      }
    }

    const insertTombstone = db.prepare('INSERT INTO link_tombstones (slug, deleted_at) VALUES (?, ?)')
    for (const tombstone of options.tombstones ?? [])
      insertTombstone.run(tombstone.slug, tombstone.deletedAt)

    const insertMigrationRun = db.prepare(`INSERT INTO link_migration_runs (id, force, status, created_at, updated_at) VALUES (?, 0, ?, ?, ?)`)
    for (const run of options.migrationRuns ?? [])
      insertMigrationRun.run(run.id, run.status, run.createdAt, run.updatedAt)
  }
  finally {
    db.close()
  }
}
