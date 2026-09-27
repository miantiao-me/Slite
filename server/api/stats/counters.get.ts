import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'Get access visit, visitor, and referer counters',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse)
  return useAnalytics(event, buildCountersQuery(query, event))
})
