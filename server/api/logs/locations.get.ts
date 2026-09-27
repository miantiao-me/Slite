import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'List recent access locations with counts',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse)
  return useAnalytics(event, buildLocationsQuery(query, event))
})
