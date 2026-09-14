import { timingSafeEqual } from 'node:crypto'

export default eventHandler(async (event) => {
  if (!event.path.startsWith('/api/'))
    return

  // Sink keeps GET /api/location public; every other API route requires auth.
  if (getRequestURL(event).pathname === '/api/location')
    return

  const token = getHeader(event, 'Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  // The storage plugin generates a process-only token when none is configured
  // and exposes it through the request context.
  const expectedSiteToken = useRuntimeConfig(event).siteToken || event.context.generatedSiteToken
  if (await verifySiteToken(token, expectedSiteToken)) {
    event.context.authMethod = 'site-token'
    event.context.userID = 'root'
    event.context.userEmail = `root@${getRequestURL(event).hostname}`
    return
  }

  if (token && token.length < 8) {
    throw createError({
      status: 401,
      statusText: 'Token is too short',
    })
  }

  throw createError({
    status: 401,
    statusText: 'Unauthorized',
  })
})

async function verifySiteToken(provided: string | undefined, expected: string | undefined): Promise<boolean> {
  if (!provided || !expected)
    return false
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided || '')),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash))
}
