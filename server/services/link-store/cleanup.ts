import { asc, inArray, lte } from 'drizzle-orm'
import { links } from '../../database/schema'
import { getDatabase } from '../../database/sqlite'

const BATCH_SIZE = 100

export function sqliteDeleteExpiredLinks(cutoff: number): string[] {
  const db = getDatabase()
  const candidates = db.select({ slug: links.slug }).from(links).where(lte(links.effectiveExpiresAt, cutoff)).orderBy(asc(links.slug)).limit(BATCH_SIZE)
  return db.delete(links).where(inArray(links.slug, candidates)).returning({ slug: links.slug }).all().map(row => row.slug)
}
