import { QuerySchema } from '#shared/schemas/query'

defineRouteMeta({
  openAPI: {
    description: 'List recent access events',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse)
  const result = await useAnalytics(event, buildEventsQuery(query, event))
  return result.data
})
