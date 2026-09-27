defineRouteMeta({
  openAPI: {
    description: 'Get access visits by weekday and hour',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, HeatmapQuerySchema.parse)
  return useAnalytics(event, buildHeatmapQuery(query, event))
})
