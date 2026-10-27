import { deleteExpiredLinks } from './link-store'

function parseRetentionDays(retentionDays: unknown): number | undefined {
  if (retentionDays === undefined || retentionDays === null || retentionDays === '')
    return undefined

  const value = String(retentionDays).trim()
  const days = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(days * 86400)) {
    console.warn('[link-cleanup] NUXT_EXPIRED_LINK_RETENTION_DAYS must be a non-negative integer; skipping cleanup')
    return undefined
  }
  return days
}

export function cleanupExpiredLinks(retentionDays: unknown): number {
  const days = parseRetentionDays(retentionDays)
  if (days === undefined)
    return 0
  const deleted = deleteExpiredLinks(Math.floor(Date.now() / 1000) - days * 86400)
  console.info(`[link-cleanup] Deleted ${deleted} expired links`)
  return deleted
}

let cleanupTimer: ReturnType<typeof setInterval> | undefined

export function startAutomaticLinkCleanup(retentionDays: unknown): void {
  if (cleanupTimer)
    return
  const days = parseRetentionDays(retentionDays)
  if (days === undefined)
    return
  cleanupTimer = setInterval(() => {
    try {
      cleanupExpiredLinks(days)
    }
    catch (error) {
      console.error('[link-cleanup] Scheduled cleanup failed', error)
    }
  }, 86_400_000)
  cleanupTimer.unref()
}

export function stopAutomaticLinkCleanup(): void {
  clearInterval(cleanupTimer)
  cleanupTimer = undefined
}
