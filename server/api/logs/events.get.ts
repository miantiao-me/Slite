import { sql } from 'kysely'
import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'List recent access events',
    security: [{ bearerAuth: [] }],
  },
})

function query2sql(query: Query) {
  const filter = buildAnalyticsFilter(query)
  const analyticsQuery = createAnalyticsQuery()
  const filteredQuery = filter ? analyticsQuery.where(filter) : analyticsQuery

  return filteredQuery
    .select([
      ...Object.entries(blobsMap).filter(([, name]) => name !== 'ip').map(([column, name]) => sql.ref(column).as(name)),
      sql.ref('double1').as('latitude'),
      sql.ref('double2').as('longitude'),
      sql<string>`CAST(event_id AS VARCHAR)`.as('id'),
      sql<number>`CAST(floor(epoch(timestamp)) AS BIGINT)`.as('timestamp'),
    ])
    .orderBy('access_events.timestamp', 'desc')
    .orderBy('event_id', 'desc')
    .limit(query.limit)
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse)
  const result = await useAnalytics(event, query2sql(query))
  return result.data
})
