defineRouteMeta({
  openAPI: {
    description: 'Get aggregated access metrics by dimension',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, MetricsQuerySchema.parse)
  return useAnalytics(event, buildMetricsQuery(query, event))
})
