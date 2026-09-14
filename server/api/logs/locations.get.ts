import { sql } from 'kysely'
import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'List recent access locations with counts',
    security: [{ bearerAuth: [] }],
  },
})

function query2sql(query: Query) {
  const filter = buildAnalyticsFilter(query)
  const limit = Math.max(0, Math.floor(query.limit))
  const analyticsQuery = createAnalyticsQuery()
    .where('double1', 'is not', null)
    .where('double2', 'is not', null)
  const filteredQuery = filter ? analyticsQuery.where(filter) : analyticsQuery

  return filteredQuery
    .select([
      sql.ref('blob8').as(blobsMap.blob8),
      sql.ref('double1').as(doublesMap.double1),
      sql.ref('double2').as(doublesMap.double2),
      sql<number>`COUNT(*)`.as('count'),
    ])
    .groupBy(['blob8', 'double1', 'double2'])
    .orderBy('count', 'desc')
    .limit(limit)
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse)
  const sql = query2sql(query)

  return useAnalytics(event, sql)
})
