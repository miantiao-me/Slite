import type { H3Event } from 'h3'
import type { Compilable } from 'kysely'
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
} from 'kysely'
import { AnalyticsUnavailableError, queryAnalytics } from '../database/analytics'

export interface AnalyticsRow {
  index1: string
  timestamp: string
  [column: string]: unknown
}

type AnalyticsDatabase = Record<string, AnalyticsRow>

// Identifiers are application-owned; user values must use bound parameters.
// eslint-disable-next-line regexp/prefer-w, regexp/use-ignore-case
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

class AnalyticsQueryCompiler extends MysqlQueryCompiler {
  protected override getLeftIdentifierWrapper(): string {
    return ''
  }

  protected override getRightIdentifierWrapper(): string {
    return ''
  }

  protected override sanitizeIdentifier(identifier: string): string {
    if (!identifierPattern.test(identifier))
      throw new Error(`Invalid Analytics identifier: ${identifier}`)

    return identifier
  }
}

const coldDb = new Kysely<AnalyticsDatabase>({
  dialect: {
    createAdapter: () => new MysqlAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: db => new MysqlIntrospector(db),
    createQueryCompiler: () => new AnalyticsQueryCompiler(),
  },
})

export function createAnalyticsQuery() {
  return coldDb.selectFrom('access_events')
}

export function compileAnalyticsQuery(query: Compilable) {
  return query.compile()
}

export async function useAnalytics(_event: H3Event, query: Compilable) {
  const compiled = compileAnalyticsQuery(query)
  const parameters = compiled.parameters.map((value) => {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
      return value
    throw new TypeError('Unsupported analytics parameter')
  })
  try {
    return { data: await queryAnalytics(compiled.sql, parameters) }
  }
  catch (error) {
    if (error instanceof AnalyticsUnavailableError) {
      throw createError({
        status: 503,
        statusText: 'Analytics unavailable',
        message: 'Analytics unavailable',
      })
    }
    throw error
  }
}
