import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'

// Forwarded addresses are only trusted when the deployment explicitly opts in
// through NUXT_TRUST_PROXY, matching every other forwarded-header consumer.
export function requestClientIp(event: H3Event): string | undefined {
  return getRequestIP(event, { xForwardedFor: useRuntimeConfig(event).trustProxy === true })
}
