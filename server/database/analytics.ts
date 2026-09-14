import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'

let instance: DuckDBInstance | undefined
let connection: DuckDBConnection | undefined
let queue: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task)
  queue = result.catch(() => {})
  return result
}

// DuckDB only backs analytics. The storage plugin opens the connection once at
// startup and closes it on shutdown; queries and writes never reopen it, so a
// failed or closed database throws one recognizable error that the API boundary
// maps to a user-facing 503 instead of retrying against an unhealthy file.
export class AnalyticsUnavailableError extends Error {
  constructor() {
    super('Analytics unavailable')
    this.name = 'AnalyticsUnavailableError'
  }
}

function requireConnection(): DuckDBConnection {
  if (!connection)
    throw new AnalyticsUnavailableError()
  return connection
}

// Cleanup errors must not replace the error that caused the cleanup.
function closeQuietly(target: { closeSync: () => void } | undefined): void {
  try {
    target?.closeSync()
  }
  catch {
    // Ignore cleanup failures so the original error stays visible.
  }
}

async function openAnalytics(dataDir: string): Promise<void> {
  if (connection)
    return

  await mkdir(dataDir, { recursive: true })
  const database = await DuckDBInstance.create(join(dataDir, 'analytics.duckdb'))
  let client: DuckDBConnection | undefined
  try {
    client = await database.connect()
    await client.run(`CREATE TABLE IF NOT EXISTS access_events (
      event_id UUID PRIMARY KEY,
      index1 VARCHAR NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      ${Array.from({ length: 16 }, (_, i) => `blob${i + 1} VARCHAR NOT NULL DEFAULT ''`).join(',\n      ')},
      double1 DOUBLE,
      double2 DOUBLE
    )`)
    instance = database
    connection = client
  }
  catch (error) {
    // A failing client close must not leak the database handle or hide the
    // initialization failure.
    closeQuietly(client)
    closeQuietly(database)
    throw error
  }
}

export function initializeAnalytics(dataDir = String(useRuntimeConfig().dataDir || '/data')): Promise<void> {
  return serialize(async () => {
    await openAnalytics(dataDir)
  })
}

export function closeAnalytics(): Promise<void> {
  return serialize(async () => {
    // Detach before closing so a failing close cannot leave stale references.
    const client = connection
    const database = instance
    connection = undefined
    instance = undefined
    try {
      client?.closeSync()
    }
    finally {
      database?.closeSync()
    }
  })
}

export function runAnalytics(sql: string, parameters: DuckDBValue[] = []): Promise<void> {
  return serialize(async () => {
    await requireConnection().run(sql, parameters)
  })
}

export function queryAnalytics(sql: string, parameters: DuckDBValue[] = []): Promise<Record<string, unknown>[]> {
  return serialize(async () => {
    const reader = await requireConnection().runAndReadAll(sql, parameters)
    return reader.getRowObjects().map(row => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint'
        ? (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : String(value))
        : value]),
    ))
  })
}
