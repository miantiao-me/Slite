defineRouteMeta({
  openAPI: {
    description: 'Verify the current authentication method',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'The authentication credentials are valid',
      },
      default: {
        description: 'The authentication credentials are invalid',
      },
    },
  },
})

export default eventHandler((event) => {
  const authMethod: unknown = event.context.authMethod
  const userID: unknown = event.context.userID
  const userEmail: unknown = event.context.userEmail
  if (
    (
      authMethod !== 'site-token'
      && authMethod !== 'access-user'
      && authMethod !== 'access-service'
    )
    || typeof userID !== 'string'
    || !userID
    || typeof userEmail !== 'string'
    || !userEmail
  ) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
    })
  }

  return {
    name: 'Slite',
    url: requestOrigin(event),
    authMethod,
    userID,
    userEmail,
    // Kept for Sink API compatibility; Slite has no Cloudflare Access.
    accessEnabled: false,
  }
})
