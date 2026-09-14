import { sql } from 'kysely'
import { z } from 'zod'
import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'Get access visits over time',
    security: [{ bearerAuth: [] }],
  },
})

const unitMap: { [x: string]: string } = {
  minute: '%Y-%m-%d %H:%M',
  hour: '%Y-%m-%d %H',
  day: '%Y-%m-%d',
}

const ViewsQuerySchema = QuerySchema.extend({
  unit: z.enum(['minute', 'hour', 'day']),
  clientTimezone: z.string()
    .regex(/^[\w+-]+(?:\/[\w+-]+)*$/)
    .max(64)
    .default('Etc/UTC'),
})

function query2sql(query: z.infer<typeof ViewsQuerySchema>) {
  const filter = buildAnalyticsFilter(query)
  const timezone = getSafeTimezone(query.clientTimezone)
  const analyticsQuery = createAnalyticsQuery()
  const filteredQuery = filter ? analyticsQuery.where(filter) : analyticsQuery

  return filteredQuery
    .select([
      sql<string>`strftime(timezone(${timezone}, ${sql.ref('timestamp')}), ${unitMap[query.unit]!})`.as('time'),
      sql<number>`COUNT(*)`.as('visits'),
      sql<number>`COUNT(DISTINCT ${sql.ref(logsMap.ip!)})`.as('visitors'),
    ])
    .groupBy('time')
    .orderBy('time')
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, ViewsQuerySchema.parse)
  const sql = query2sql(query)
  return useAnalytics(event, sql)
})
