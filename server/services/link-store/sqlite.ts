import type { H3Event } from 'h3'
import type { Link } from '#shared/schemas/link'
import type { LinkSearchItem, LinkSortBy, LinkStatus } from '#shared/types/link'
import { and, asc, count, desc, eq, exists, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { chunk } from 'es-toolkit'
import { createError } from 'h3'
import { parseURL, stringifyParsedURL } from 'ufo'
import { decodeBase64Url, encodeBase64Url } from '#shared/utils/cursor'
import { links, linkTags, tags } from '../../database/schema'
import { getDatabase as database } from '../../database/sqlite'
import { getExpiration } from '../../utils/time'

const CURSOR_PREFIX = 'sqlite:v2:'

type LinkRow = typeof links.$inferSelect

export interface ExpectedLinkVersion {
  id: string
  updatedAt: number
}

export interface ListLinksOptions {
  limit: number
  cursor?: string
  sort?: LinkSortBy
  tag?: string
  status?: LinkStatus
}

export interface ListLinksResult {
  links: Link[]
  list_complete: boolean
  cursor?: string
}

export interface LinkFilterOptions {
  q?: string
  url?: string
  tag?: string
  status?: LinkStatus
}

export interface SearchLinksOptions extends LinkFilterOptions {
  limit?: number
}

interface LinkCursor {
  sort: LinkSortBy
  slug: string
  createdAt?: number
  tag?: string
  status: LinkStatus
}

function withoutQuery(url: string): string {
  const parsed = parseURL(url)
  return stringifyParsedURL({ ...parsed, search: '' })
}

function getDatabase(_event?: H3Event) {
  return database()
}

function activeCondition(now = Math.floor(Date.now() / 1000)) {
  return or(isNull(links.effectiveExpiresAt), gt(links.effectiveExpiresAt, now))
}

function statusCondition(status: LinkStatus, now = Math.floor(Date.now() / 1000)) {
  if (status === 'active')
    return activeCondition(now)
  if (status === 'expired')
    return and(isNotNull(links.effectiveExpiresAt), lte(links.effectiveExpiresAt, now))
  return undefined
}

function exactTagCondition(db: ReturnType<typeof getDatabase>, tag: string | undefined) {
  return tag
    ? exists(db.select({ linkSlug: linkTags.linkSlug }).from(linkTags).where(and(
        eq(linkTags.linkSlug, links.slug),
        eq(linkTags.tagName, tag),
      )))
    : undefined
}

function rowToLink(row: LinkRow): Link {
  const link: Link = {
    id: row.id,
    url: row.url,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: [],
  }
  const optionalFields = [
    'comment',
    'expiration',
    'title',
    'description',
    'image',
    'apple',
    'google',
    'cloaking',
    'redirectWithQuery',
    'password',
    'unsafe',
    'geo',
  ] as const

  for (const field of optionalFields) {
    const value = row[field]
    if (value !== null)
      Object.assign(link, { [field]: value })
  }

  return link
}

function addTagsToLinksFromDatabase<T extends { slug: string, tags: string[] }>(db: Pick<ReturnType<typeof getDatabase>, 'select'>, result: T[], slugs: string[]): T[] {
  const bySlug = new Map(result.map(link => [link.slug, link]))
  for (const batch of chunk(slugs, 90)) {
    const rows = db
      .select({ slug: linkTags.linkSlug, tag: linkTags.tagName })
      .from(linkTags)
      .where(inArray(linkTags.linkSlug, batch))
      .orderBy(asc(linkTags.tagName))
      .all()
    for (const row of rows)
      bySlug.get(row.slug)?.tags.push(row.tag)
  }
  return result
}

function rowsToLinks(event: H3Event, rows: LinkRow[]): Link[] {
  const result = rows.map(rowToLink)
  return addTagsToLinksFromDatabase(getDatabase(event), result, result.map(link => link.slug))
}

function buildLinkValues(event: H3Event, link: Link, effectiveExpiresAt?: number | null) {
  return {
    slug: link.slug,
    id: link.id,
    url: link.url,
    comment: link.comment ?? null,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    expiration: link.expiration ?? null,
    title: link.title ?? null,
    description: link.description ?? null,
    image: link.image ?? null,
    apple: link.apple ?? null,
    google: link.google ?? null,
    cloaking: link.cloaking ?? null,
    redirectWithQuery: link.redirectWithQuery ?? null,
    password: link.password ?? null,
    unsafe: link.unsafe ?? null,
    geo: link.geo ?? null,
    normalizedUrl: withoutQuery(link.url),
    effectiveExpiresAt: effectiveExpiresAt === undefined ? getExpiration(event, link.expiration) ?? null : effectiveExpiresAt,
  }
}

export function sqliteGetActiveLink(event: H3Event, slug: string): { link: Link, effectiveExpiresAt: number | null } | null {
  const row = getDatabase(event).select().from(links).where(and(eq(links.slug, slug), activeCondition())).get()
  if (!row)
    return null
  const [link] = rowsToLinks(event, [row])
  return link ? { link, effectiveExpiresAt: row.effectiveExpiresAt } : null
}

export async function sqliteGetAnyLink(event: H3Event, slug: string): Promise<Link | null> {
  const rows = await getDatabase(event).select().from(links).where(eq(links.slug, slug)).limit(1)
  return rows[0] ? (await rowsToLinks(event, rows))[0] ?? null : null
}

export async function sqliteGetLinkWithMetadata(event: H3Event, slug: string): Promise<{ link: Link | null, metadata: Record<string, unknown> | null }> {
  const rows = await getDatabase(event).select().from(links).where(eq(links.slug, slug)).limit(1)
  const row = rows[0]
  const link = row ? (await rowsToLinks(event, [row]))[0] ?? null : null
  return {
    link,
    metadata: row && link
      ? { expiration: row.effectiveExpiresAt ?? undefined, url: withoutQuery(link.url), comment: link.comment }
      : null,
  }
}

export function sqliteCreateLink(event: H3Event, link: Link): { created: boolean, effectiveExpiresAt: number | null } {
  const db = getDatabase(event)
  return db.transaction(tx => createStoredLink(event, tx, link))
}

function replaceTags(db: Pick<ReturnType<typeof getDatabase>, 'insert' | 'delete'>, link: Link) {
  db.delete(linkTags).where(eq(linkTags.linkSlug, link.slug)).run()
  for (const tag of link.tags) {
    db.insert(tags).values({ name: tag }).onConflictDoNothing().run()
    db.insert(linkTags).values({ linkSlug: link.slug, tagName: tag }).onConflictDoNothing().run()
  }
}

function createStoredLink(event: H3Event, db: Pick<ReturnType<typeof getDatabase>, 'insert' | 'delete'>, link: Link) {
  const now = Math.floor(Date.now() / 1000)
  const values = buildLinkValues(event, link)
  const effectiveExpiresAt = values.effectiveExpiresAt
  const inserted = db.insert(links).values(values).onConflictDoUpdate({
    target: links.slug,
    set: values,
    setWhere: and(isNotNull(links.effectiveExpiresAt), lte(links.effectiveExpiresAt, now)),
  }).returning({ slug: links.slug }).all()
  if (inserted.length)
    replaceTags(db, link)
  return { created: inserted.length > 0, effectiveExpiresAt }
}

export function sqliteUpdateLink(event: H3Event, link: Link, expected?: ExpectedLinkVersion): { updated: boolean, effectiveExpiresAt: number | null } {
  const values = buildLinkValues(event, link)
  const db = getDatabase(event)
  return db.transaction((tx) => {
    const updated = tx.update(links).set(values).where(and(
      eq(links.slug, link.slug),
      expected ? eq(links.id, expected.id) : undefined,
      expected ? eq(links.updatedAt, expected.updatedAt) : undefined,
    )).returning({ slug: links.slug }).all()
    if (updated.length)
      replaceTags(tx, link)
    return { updated: updated.length > 0, effectiveExpiresAt: values.effectiveExpiresAt }
  })
}

export function sqliteDeleteLink(event: H3Event, slug: string): void {
  const db = getDatabase(event)
  db.delete(links).where(eq(links.slug, slug)).run()
}

function encodeCursor(cursor: LinkCursor): string {
  return `${CURSOR_PREFIX}${encodeBase64Url(JSON.stringify(cursor))}`
}

function invalidCursor(): never {
  throw createError({ status: 400, statusText: 'Invalid pagination cursor' })
}

function decodeCursor(cursor: string | undefined, sort: LinkSortBy, tag: string | undefined, status: LinkStatus): LinkCursor | undefined {
  if (!cursor)
    return undefined
  if (!cursor.startsWith(CURSOR_PREFIX))
    invalidCursor()
  try {
    const decoded = JSON.parse(decodeBase64Url(cursor.slice(CURSOR_PREFIX.length))) as LinkCursor
    if (decoded.sort !== sort || decoded.tag !== tag || decoded.status !== status || typeof decoded.slug !== 'string')
      throw new Error('Cursor does not match sort')
    if ((sort === 'newest' || sort === 'oldest') && typeof decoded.createdAt !== 'number')
      throw new Error('Cursor is missing creation time')
    return decoded
  }
  catch {
    invalidCursor()
  }
}

export async function sqliteListLinks(event: H3Event, options: ListLinksOptions): Promise<ListLinksResult> {
  const db = getDatabase(event)
  const sort = options.sort ?? 'newest'
  const status = options.status ?? 'active'
  const cursor = decodeCursor(options.cursor, sort, options.tag, status)
  let cursorCondition
  let order

  if (sort === 'az') {
    cursorCondition = cursor ? gt(links.slug, cursor.slug) : undefined
    order = [asc(links.slug)]
  }
  else if (sort === 'za') {
    cursorCondition = cursor ? lt(links.slug, cursor.slug) : undefined
    order = [desc(links.slug)]
  }
  else if (sort === 'newest') {
    cursorCondition = cursor ? or(lt(links.createdAt, cursor.createdAt!), and(eq(links.createdAt, cursor.createdAt!), gt(links.slug, cursor.slug))) : undefined
    order = [desc(links.createdAt), asc(links.slug)]
  }
  else {
    cursorCondition = cursor ? or(gt(links.createdAt, cursor.createdAt!), and(eq(links.createdAt, cursor.createdAt!), gt(links.slug, cursor.slug))) : undefined
    order = [asc(links.createdAt), asc(links.slug)]
  }

  const tagCondition = exactTagCondition(db, options.tag)
  const rows = await db.select().from(links).where(and(statusCondition(status), tagCondition, cursorCondition)).orderBy(...order).limit(options.limit + 1)
  const hasMore = rows.length > options.limit
  const page = hasMore ? rows.slice(0, options.limit) : rows
  const last = page.at(-1)
  return {
    links: await rowsToLinks(event, page),
    list_complete: !hasMore,
    cursor: hasMore && last ? encodeCursor({ sort, slug: last.slug, createdAt: last.createdAt, tag: options.tag, status }) : undefined,
  }
}

// Backups need links and their tags from one repeatable read, so the whole
// snapshot is taken inside a single deferred transaction.
export function sqliteSnapshotAllLinks(): Link[] {
  return getDatabase().transaction((tx) => {
    const rows = tx.select().from(links).orderBy(asc(links.slug)).all()
    const snapshot = rows.map((row) => {
      const link = rowToLink(row)
      if (link.expiration === undefined && row.effectiveExpiresAt !== null)
        link.expiration = row.effectiveExpiresAt
      return link
    })
    return addTagsToLinksFromDatabase(tx, snapshot, snapshot.map(link => link.slug))
  })
}

function linkFilterCondition(db: ReturnType<typeof getDatabase>, options: LinkFilterOptions) {
  const status = options.status ?? 'active'
  const conditions = [statusCondition(status)]
  if (options.tag)
    conditions.push(exactTagCondition(db, options.tag))
  if (options.url)
    conditions.push(eq(links.normalizedUrl, withoutQuery(options.url)))
  if (options.q) {
    const pattern = `%${options.q.toLowerCase().replace(/[!%_]/g, '!$&')}%`
    conditions.push(or(
      sql`lower(${links.slug}) like ${pattern} escape '!'`,
      sql`lower(${links.url}) like ${pattern} escape '!'`,
      sql`lower(coalesce(${links.comment}, '')) like ${pattern} escape '!'`,
      sql`exists (select 1 from ${linkTags} where ${linkTags.linkSlug} = ${links.slug} and lower(${linkTags.tagName}) like ${pattern} escape '!')`,
    )!)
  }

  return and(...conditions)
}

export async function sqliteSearchLinks(event: H3Event, options: SearchLinksOptions): Promise<LinkSearchItem[]> {
  const db = getDatabase(event)
  let query = db.select({ slug: links.slug, url: links.normalizedUrl, comment: links.comment }).from(links).where(linkFilterCondition(db, options)).orderBy(asc(links.slug)).$dynamic()
  if (options.limit)
    query = query.limit(options.limit)
  const rows = await query
  const result = rows.map(row => ({ slug: row.slug, url: row.url, tags: [] as string[], ...(row.comment === null ? {} : { comment: row.comment }) }))
  return await addTagsToLinksFromDatabase(db, result, result.map(link => link.slug))
}

export async function sqliteCountLinks(event: H3Event, options: LinkFilterOptions): Promise<number> {
  const db = getDatabase(event)
  const [result] = await db.select({ count: count() }).from(links).where(linkFilterCondition(db, options))
  return result?.count ?? 0
}

export async function sqliteListTags(event: H3Event): Promise<{ name: string, count: number }[]> {
  return await getDatabase(event)
    .select({ name: tags.name, count: count(linkTags.linkSlug) })
    .from(tags)
    .innerJoin(linkTags, eq(linkTags.tagName, tags.name))
    .groupBy(tags.name)
    .orderBy(asc(tags.name))
}
