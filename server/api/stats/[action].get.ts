import type { RawBuilder } from 'kysely'
import { sql } from 'kysely'
import { z } from 'zod'
import { QuerySchema } from '#shared/schemas/query'
import { generateCsv } from '#shared/utils/csv'
import { createExportFilename } from '#shared/utils/export-file'

defineRouteMeta({
  openAPI: {
    description: 'Export access analytics as CSV',
    security: [{ bearerAuth: [] }],
  },
})

const CsvColumns = ['slug', 'url', 'viewer', 'views', 'referer'] as const

interface AccessExportRow {
  slug?: string
  url?: string
  viewer?: number
  views?: number
  referer?: number
}

const StatsExportQuerySchema = QuerySchema.superRefine((query, ctx) => {
  if (query.startAt !== undefined && query.endAt !== undefined && query.startAt > query.endAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startAt must be less than or equal to endAt',
      path: ['startAt'],
    })
  }
})

function distinctCount(column: string): RawBuilder<number> {
  return sql<number>`COUNT(DISTINCT ${sql.ref(column)})`
}

function distinctReferers(column: string): RawBuilder<number> {
  return sql<number>`COUNT(DISTINCT NULLIF(${sql.ref(column)}, ${''}))`
}

function query2sql(query: z.infer<typeof StatsExportQuerySchema>) {
  const filter = buildAnalyticsFilter(query)
  const analyticsQuery = createAnalyticsQuery()
  const filteredQuery = filter ? analyticsQuery.where(filter) : analyticsQuery

  return filteredQuery
    .select([
      sql.ref(logsMap.slug!).as('slug'),
      sql.ref(logsMap.url!).as('url'),
      distinctCount(logsMap.ip!).as('viewer'),
      sql<number>`COUNT(*)`.as('views'),
      distinctReferers(logsMap.referer!).as('referer'),
    ])
    .groupBy(['slug', 'url'])
    .orderBy('views', 'desc')
}

function toCsv(rows: AccessExportRow[]): string {
  return generateCsv([...CsvColumns], rows.map(row => CsvColumns.map(column => row[column])))
}

export default eventHandler(async (event) => {
  if (getRouterParam(event, 'action') !== 'export') {
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  const query = await getValidatedQuery(event, StatsExportQuerySchema.parse)
  const sql = query2sql(query)
  const result = await useAnalytics(event, sql) as { data?: AccessExportRow[] }
  const csv = toCsv(result.data ?? [])

  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${createExportFilename('slite-access', 'csv')}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return csv
})
