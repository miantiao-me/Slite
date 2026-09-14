import type { H3Event } from 'h3'
import { ofetch } from 'ofetch'

export async function isSafeUrl(event: H3Event, url: string): Promise<boolean> {
  const { safeBrowsingDoh } = useRuntimeConfig(event)
  // No endpoint configured: the check is disabled and the URL is treated as safe.
  if (!safeBrowsingDoh)
    return true

  try {
    const { hostname } = new URL(url)
    const dohUrl = new URL(safeBrowsingDoh)
    dohUrl.searchParams.set('type', 'A')
    dohUrl.searchParams.set('name', hostname)

    const dnsResult = await ofetch<{ Answer?: Array<{ data: string }> }>(dohUrl.toString(), {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
      responseType: 'json',
    })
    if (dnsResult && Array.isArray(dnsResult.Answer)) {
      const isBlocked = dnsResult.Answer.some(answer => answer.data === '0.0.0.0')
      return !isBlocked
    }
  }
  catch (e) {
    const { hostname } = new URL(url)
    console.warn('isSafeUrl check failed:', hostname, e)
  }
  return true
}
