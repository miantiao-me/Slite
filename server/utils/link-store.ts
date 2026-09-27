import type { H3Event } from 'h3'
import type { Link } from '#shared/schemas/link'
import type { ExpectedLinkVersion } from '../services/link-store/sqlite'
import { getCachedLink, invalidateCachedLink, putCachedLink } from '../services/link-store/cache'
import { sqliteCreateLink, sqliteCreateLinks, sqliteDeleteLink, sqliteGetActiveLink, sqliteUpdateLink } from '../services/link-store/sqlite'

export {
  sqliteCountLinks as countLinks,
  sqliteGetAnyLink as getAnyAuthoritativeLink,
  sqliteGetLinkWithMetadata as getLinkWithMetadata,
  sqliteListLinks as listLinks,
  sqliteListTags as listTags,
  sqliteSearchLinks as searchLinks,
  sqliteSnapshotAllLinks as snapshotAllAuthoritativeLinks,
} from '../services/link-store/sqlite'

export function normalizeSlug(event: H3Event, slug: string): string {
  return useRuntimeConfig(event).caseSensitive ? slug : slug.toLowerCase()
}

export function buildShortLink(event: H3Event, slug: string): string {
  return `${requestOrigin(event)}/${slug}`
}

export async function getLink(event: H3Event, slug: string): Promise<Link | null> {
  const cached = getCachedLink(slug)
  if (cached)
    return cached.link
  const stored = sqliteGetActiveLink(event, slug)
  if (stored)
    putCachedLink(slug, stored)
  return stored?.link ?? null
}

export async function getAuthoritativeLink(event: H3Event, slug: string): Promise<Link | null> {
  return sqliteGetActiveLink(event, slug)?.link ?? null
}

export async function createLink(event: H3Event, link: Link): Promise<boolean> {
  const { created } = sqliteCreateLink(event, link)
  if (created)
    invalidateCachedLink(link.slug)
  return created
}

export type CreateLinksResult = { created: boolean } | { error: unknown }

export async function createLinks(event: H3Event, links: Link[]): Promise<CreateLinksResult[]> {
  let results: ReturnType<typeof sqliteCreateLinks>
  try {
    results = sqliteCreateLinks(event, links)
  }
  catch {
    const fallbackResults: CreateLinksResult[] = []
    for (const link of links) {
      try {
        fallbackResults.push({ created: await createLink(event, link) })
      }
      catch (error) {
        fallbackResults.push({ error })
      }
    }
    return fallbackResults
  }

  for (const [index, result] of results.entries()) {
    if (result.created)
      invalidateCachedLink(links[index]!.slug)
  }
  return results.map(result => ({ created: result.created }))
}

export async function updateLink(event: H3Event, link: Link, expected?: ExpectedLinkVersion): Promise<boolean> {
  const { updated } = sqliteUpdateLink(event, link, expected)
  if (updated)
    invalidateCachedLink(link.slug)
  return updated
}

export async function deleteLink(event: H3Event, slug: string): Promise<void> {
  try {
    sqliteDeleteLink(event, slug)
  }
  finally {
    invalidateCachedLink(slug)
  }
}
