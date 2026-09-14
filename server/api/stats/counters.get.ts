import type { RawBuilder } from 'kysely'
import { sql } from 'kysely'
import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'Get access visit, visitor, and referer counters',
    security: [{ bearerAuth: [] }],
  },
})

function distinctCount(column: string): RawBuilder<number> {
  return sql<number>`COUNT(DISTINCT ${sql.ref(column)})`
}

function distinctReferers(column: string): RawBuilder<number> {
  return sql<number>`COUNT(DISTINCT NULLIF(${sql.ref(column)}, ${''}))`
}

function query2sql(query: Query) {
  const filter = buildAnalyticsFilter(query)
  const analyticsQuery = createAnalyticsQuery()
  const filteredQuery = filter ? analyticsQuery.where(filter) : analyticsQuery
  const statement = filteredQuery.select([
    sql<number>`COUNT(*)`.as('visits'),
    distinctCount(logsMap.ip!).as('visitors'),
    distinctReferers(logsMap.referer!).as('referers'),
  ])

  return query.id
    ? statement.select(sql.ref('index1').as('id')).groupBy('index1')
    : statement
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse)
  const sql = query2sql(query)
  return useAnalytics(event, sql)
})
