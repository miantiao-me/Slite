import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'

export type SliteDatabase = NodeSQLiteDatabase & { $client: DatabaseSync }

let connection: DatabaseSync | undefined
let database: SliteDatabase | undefined

// Development and tests find the project drizzle/ folder through cwd, while
// the build copies drizzle/ next to the server entry, so the entry path keeps
// working from any working directory.
function resolveMigrationsFolder(): string {
  const roots = [
    ...(process.argv[1] ? [dirname(resolve(process.argv[1]))] : []),
    process.cwd(),
  ]
  for (const root of roots) {
    const folder = join(root, 'drizzle')
    if (existsSync(folder))
      return folder
  }
  throw new Error('Could not locate the drizzle migrations folder')
}

export function initializeDatabase(dataDir = String(useRuntimeConfig().dataDir || '/data')) {
  if (database)
    return database
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const client = new DatabaseSync(join(dataDir, 'slite.sqlite'))
  try {
    client.exec('PRAGMA journal_mode = WAL')
    client.exec('PRAGMA foreign_keys = ON')
    client.exec('PRAGMA synchronous = FULL')
    client.exec('PRAGMA busy_timeout = 5000')
    const db = drizzle({ client })
    migrate(db, { migrationsFolder: resolveMigrationsFolder() })
    connection = client
    database = db
    return db
  }
  catch (error) {
    client.close()
    throw error
  }
}

export function getDatabase(): SliteDatabase {
  if (!database)
    throw new Error('SQLite is not initialized; call initializeDatabase() first')
  return database
}

export function closeDatabase(): void {
  const client = connection
  try {
    // Detach before closing so a failing close cannot leave stale references.
    connection = undefined
    database = undefined
  }
  finally {
    client?.close()
  }
}
