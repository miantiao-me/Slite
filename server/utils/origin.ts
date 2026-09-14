import type { H3Event } from 'h3'
import { getRequestHost, getRequestProtocol } from 'h3'

export function requestOrigin(event: H3Event): string {
  const trusted = useRuntimeConfig(event).trustProxy === true
  const protocol = getRequestProtocol(event, { xForwardedProto: trusted })
  const host = getRequestHost(event, { xForwardedHost: trusted })
  return `${protocol}://${host}`
}
