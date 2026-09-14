import type { Storage } from 'unstorage'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath, rename, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

type StorageArea = 'images' | 'backups'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const storages = new Map<string, Storage>()

function validateSegments(key: string): string[] {
  const parts = key.split('/')
  if (parts.some(part => !/^[\w-][\w.-]*$/.test(part) || part === '.' || part === '..'))
    throw createError({ statusCode: 400, statusMessage: 'Invalid file path' })
  return parts
}

export async function storageDirectory(area: StorageArea, create = true): Promise<string> {
  const root = resolve(useRuntimeConfig().dataDir || '/data')
  if (create)
    await mkdir(root, { recursive: true, mode: 0o700 })
  let directory = await realpath(root)
  for (const part of area === 'images' ? ['files', 'images'] : ['backups']) {
    directory = join(directory, part)
    if (create)
      await mkdir(directory, { recursive: true, mode: 0o700 })
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw createError({ statusCode: 403, statusMessage: 'Unsafe storage directory' })
  }
  return directory
}

async function resolveStoredPath(root: string, parts: string[], create: boolean): Promise<string> {
  let directory = root
  for (const part of parts.slice(0, -1)) {
    directory = join(directory, part)
    if (create)
      await mkdir(directory, { recursive: true, mode: 0o700 })
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw createError({ statusCode: 403, statusMessage: 'Unsafe storage directory' })
  }
  return join(directory, parts.at(-1)!)
}

function areaStorage(area: StorageArea, root: string): Storage {
  const key = `${area}:${root}`
  let storage = storages.get(key)
  if (!storage) {
    storage = createStorage({ driver: fsDriver({ base: root }) })
    storages.set(key, storage)
  }
  return storage
}

export async function writeStoredFile(area: StorageArea, key: string, data: Uint8Array | ReadableStream<Uint8Array>): Promise<void> {
  const parts = validateSegments(key)
  const root = await storageDirectory(area, true)
  const target = await resolveStoredPath(root, parts, true)
  const storage = areaStorage(area, root)
  // The fs driver has no streaming or atomic write API, so the payload is
  // buffered and staged on a pending key that the rename commits atomically.
  // A large backup therefore lives in memory until it is written to disk.
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await new Response(data).arrayBuffer())
  const pendingName = `${parts.at(-1)!}.pending-${randomUUID()}`
  const pendingKey = [...parts.slice(0, -1), pendingName].join('/')
  const pending = join(root, pendingKey)
  try {
    await storage.setItemRaw(pendingKey, bytes)
    await rename(pending, target)
  }
  finally {
    await unlink(pending).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT')
        console.warn('[files] Failed to remove temporary file', error)
    })
  }
}

export async function readStoredImage(key: string): Promise<{ body: Buffer, contentType: string, etag: string } | null> {
  const match = /^images\/[\w-]+\/[\w-]+\.(jpeg|png|webp|gif)$/.exec(key)
  if (!match)
    throw createError({ statusCode: 400, statusMessage: 'Invalid image path' })
  try {
    const parts = validateSegments(key.slice('images/'.length))
    const root = await storageDirectory('images', false)
    const path = await resolveStoredPath(root, parts, false)
    // Reject symlinks and oversize files before the driver reads the content.
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_IMAGE_BYTES)
      throw createError({ statusCode: 403, statusMessage: 'Invalid image file' })
    const stored = await areaStorage('images', root).getItemRaw(parts.join('/'))
    if (!stored)
      return null
    const body = Buffer.isBuffer(stored) ? stored : Buffer.from(stored as Uint8Array)
    return { body, contentType: `image/${match[1]}`, etag: `"${createHash('sha256').update(body).digest('hex')}"` }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return null
    throw error
  }
}
