import type { H3Event } from 'h3'
import type { LinkCheckRequest, LinkCheckResponse, LinkCheckResult } from '#shared/types/link-check'
import { toErrorMessage } from '#shared/utils/error'
import { listLinks } from './link-store'
import { OutboundUrlError, requestPublicUrl } from './outbound-url'

const SAFE_FORWARDED_HEADERS = ['accept-language', 'user-agent'] as const
const BLOCKED_URL_MESSAGE = 'URL is not allowed for server-side checking'

function getSafeHeaders(event: H3Event): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const name of SAFE_FORWARDED_HEADERS) {
    const value = getHeader(event, name)
    if (value)
      headers[name] = value
  }

  return headers
}

async function checkLink(
  target: { slug: string, url: string },
  headers: Record<string, string>,
  timeoutSeconds: number,
): Promise<LinkCheckResult> {
  const startedAt = Date.now()
  const checkedAt = new Date().toISOString()
  const link = target

  try {
    const { status } = await requestPublicUrl(link.url, {
      headers,
      timeoutMs: timeoutSeconds * 1000,
    })

    return {
      ...link,
      status,
      ok: status < 400,
      duration: Date.now() - startedAt,
      checkedAt,
    }
  }
  catch (error) {
    return {
      ...link,
      status: 0,
      ok: false,
      error: error instanceof OutboundUrlError ? BLOCKED_URL_MESSAGE : toErrorMessage(error, 300),
      duration: Date.now() - startedAt,
      checkedAt,
    }
  }
}

export async function checkLinksPage(event: H3Event, { cursor, limit, timeout }: LinkCheckRequest): Promise<LinkCheckResponse> {
  const headers = getSafeHeaders(event)
  const page = await listLinks(event, {
    cursor,
    limit,
    sort: 'az',
    status: 'all',
  })

  return {
    results: await Promise.all(page.links.map(({ slug, url }) => checkLink({ slug, url }, headers, timeout))),
    cursor: page.cursor,
    list_complete: page.list_complete,
  }
}
