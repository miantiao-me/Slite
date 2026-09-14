import type { Link } from '#shared/schemas/link'
import { randomUUID } from 'node:crypto'
import { readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { storageDirectory, writeStoredFile } from './files'
import { snapshotAllAuthoritativeLinks } from './link-store'

export interface BackupData {
  version: string
  exportedAt: string
  count: number
  links: Link[]
}

export interface BackupResult {
  completed: true
  filename: string
  count: number
}

const encoder = new TextEncoder()

async function pruneBackups(): Promise<void> {
  const retention = 30
  const directory = await storageDirectory('backups')
  const entries = await readdir(directory, { withFileTypes: true })
  // Manual backups are never removed by automatic retention.
  const filenames = entries
    .filter(entry => entry.isFile() && /^links-\d{4}-\d{2}-\d{2}T[\d.-]+Z-[\da-f-]+\.json$/.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .reverse()
  await Promise.all(filenames.slice(retention).map(filename => unlink(join(directory, filename))))
}

export async function backupLinksToDisk(isManual = false): Promise<BackupResult> {
  const now = new Date()
  const prefix = isManual ? 'manual-links-' : 'links-'
  const name = `${prefix}${now.toISOString().replace(/:/g, '-')}-${randomUUID()}.json`
  const links = snapshotAllAuthoritativeLinks()
  const backup: BackupData = { version: '1.0', exportedAt: now.toISOString(), count: links.length, links }
  await writeStoredFile('backups', name, encoder.encode(JSON.stringify(backup)))
  if (!isManual) {
    try {
      await pruneBackups()
    }
    catch (error) {
      console.warn('[backup] Failed to prune old backups', error)
    }
  }
  const filename = `backups/${name}`
  console.info(`[backup] Backup completed: ${filename}, ${links.length} links`)
  return { completed: true, filename, count: links.length }
}

let backupTimer: ReturnType<typeof setInterval> | undefined
let runningBackup: Promise<unknown> | undefined

export function startAutomaticBackups(): void {
  if (backupTimer)
    return
  backupTimer = setInterval(() => {
    if (runningBackup)
      return
    runningBackup = backupLinksToDisk()
      .catch(error => console.error('[backup] Scheduled backup failed', error))
      .finally(() => { runningBackup = undefined })
  }, 86_400_000)
  backupTimer.unref()
}

export async function stopAutomaticBackups(): Promise<void> {
  clearInterval(backupTimer)
  backupTimer = undefined
  await runningBackup
}
