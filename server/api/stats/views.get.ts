defineRouteMeta({
  openAPI: {
    description: 'Get access visits over time',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, ViewsQuerySchema.parse)
  return useAnalytics(event, buildViewsQuery(query, event))
})
