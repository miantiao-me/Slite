import { sql } from 'kysely'
import { z } from 'zod'
import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'Get aggregated access metrics by dimension',
    security: [{ bearerAuth: [] }],
  },
})

// Sink accepts every blob and double field except the Cloudflare-only COLO blob.
const metricTypes = [
  'browser',
  'browserType',
  'city',
  'country',
  'device',
  'deviceType',
  'ip',
  'language',
  'latitude',
  'longitude',
  'os',
  'referer',
  'region',
  'slug',
  'timezone',
  'ua',
  'url',
] as const

const MetricsQuerySchema = QuerySchema.extend({
  type: z.enum(metricTypes),
})

function query2sql(query: z.infer<typeof MetricsQuerySchema>) {
  const filter = buildAnalyticsFilter(query)
  const limit = Math.max(0, Math.floor(query.limit))
  // Double metrics (latitude/longitude) resolve to numeric columns too.
  const metricColumn = logsMap[query.type] as string
  const analyticsQuery = createAnalyticsQuery()
  const filteredQuery = filter ? analyticsQuery.where(filter) : analyticsQuery

  return filteredQuery
    .select([
      sql.ref(metricColumn).as('name'),
      sql<number>`COUNT(*)`.as('count'),
    ])
    .groupBy('name')
    .orderBy('count', 'desc')
    .limit(limit)
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, MetricsQuerySchema.parse)
  const sql = query2sql(query)
  return useAnalytics(event, sql)
})
