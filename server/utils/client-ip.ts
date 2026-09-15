import type { H3Event } from 'h3'
import { getHeader, getRequestIP } from 'h3'

// Forwarded addresses are only trusted on explicit opt-in: NUXT_CLIENT_IP_HEADER
// names a proxy-set header and takes priority, while NUXT_TRUST_PROXY enables
// the standard X-Forwarded-For header as the fallback.
export function requestClientIp(event: H3Event): string | undefined {
  const { trustProxy, clientIpHeader } = useRuntimeConfig(event)
  if (clientIpHeader) {
    const value = getHeader(event, clientIpHeader)?.split(',')[0]?.trim()
    if (value)
      return value
  }
  return getRequestIP(event, { xForwardedFor: trustProxy === true })
}
