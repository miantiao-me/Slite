import { sql } from 'kysely'
import { z } from 'zod'
import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'Get access visits by weekday and hour',
    security: [{ bearerAuth: [] }],
  },
})

const HeatmapQuerySchema = QuerySchema.extend({
  clientTimezone: z.string()
    .regex(/^[\w+-]+(?:\/[\w+-]+)*$/)
    .max(64)
    .default('Etc/UTC'),
})

function query2sql(query: z.infer<typeof HeatmapQuerySchema>) {
  const filter = buildAnalyticsFilter(query)
  const timezone = getSafeTimezone(query.clientTimezone)
  const tzTimestamp = sql<string>`timezone(${timezone}, ${sql.ref('timestamp')})`
  const analyticsQuery = createAnalyticsQuery()
  const filteredQuery = filter ? analyticsQuery.where(filter) : analyticsQuery

  return filteredQuery
    .select([
      sql<number>`isodow(${tzTimestamp})`.as('weekday'),
      sql<number>`hour(${tzTimestamp})`.as('hour'),
      sql<number>`COUNT(*)`.as('visits'),
      sql<number>`COUNT(DISTINCT ${sql.ref(logsMap.ip!)})`.as('visitors'),
    ])
    .groupBy(['weekday', 'hour'])
    .orderBy('weekday')
    .orderBy('hour')
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, HeatmapQuerySchema.parse)
  const sql = query2sql(query)
  return useAnalytics(event, sql)
})
