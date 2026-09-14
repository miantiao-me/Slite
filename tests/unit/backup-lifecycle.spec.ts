import type { Link } from '../../shared/schemas/link'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  write: vi.fn(),
  closeDatabase: vi.fn(),
  closeAnalytics: vi.fn(),
  closeLinkCache: vi.fn(),
}))

vi.mock('../../server/utils/link-store', () => ({ snapshotAllAuthoritativeLinks: mocks.snapshot }))
vi.mock('../../server/utils/files', () => ({
  writeStoredFile: mocks.write,
  storageDirectory: vi.fn(async () => '/unused-mocked-backups'),
}))
vi.mock('node:fs/promises', () => ({ readdir: vi.fn(async () => []), unlink: vi.fn() }))
vi.mock('../../server/database/sqlite', () => ({ initializeDatabase: vi.fn(), closeDatabase: mocks.closeDatabase }))
vi.mock('../../server/database/analytics', () => ({ initializeAnalytics: vi.fn(), closeAnalytics: mocks.closeAnalytics }))
vi.mock('../../server/services/link-store/cache', () => ({ initializeLinkCache: vi.fn(), closeLinkCache: mocks.closeLinkCache }))

interface PluginHooks {
  close: Array<() => Promise<void>>
  request: Array<(event: unknown) => Promise<void>>
}

// Loads the storage plugin with the real backup scheduler wired in as the
// Nitro auto-import, then waits until storage readiness settles.
async function loadStoragePlugin(config: Record<string, unknown>): Promise<PluginHooks> {
  vi.resetModules()
  const { startAutomaticBackups, stopAutomaticBackups } = await import('../../server/utils/backup')
  const hooks: PluginHooks = { close: [], request: [] }
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('startAutomaticBackups', startAutomaticBackups)
  vi.stubGlobal('stopAutomaticBackups', stopAutomaticBackups)
  vi.stubGlobal('drainWebhookDeliveries', vi.fn(async () => {}))
  const { default: plugin } = await import('../../server/plugins/00.storage')
  ;(plugin as unknown as (app: unknown) => void)({
    hooks: {
      hook: (name: keyof PluginHooks, callback: never) => {
        hooks[name].push(callback)
      },
    },
  })
  await hooks.request[0]!({ handled: false })
  return hooks
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('automatic backup lifecycle', () => {
  it.each([true, false])('honors the resolved disableAutoBackup runtime setting %s', async (disableAutoBackup) => {
    vi.useFakeTimers()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    mocks.snapshot.mockReturnValue([])
    mocks.write.mockResolvedValue(undefined)

    const hooks = await loadStoragePlugin({ siteToken: 'test-token', dataDir: '/unused-mocked-data', disableAutoBackup })
    vi.advanceTimersByTime(86_400_000)
    expect(mocks.snapshot).toHaveBeenCalledTimes(disableAutoBackup ? 0 : 1)
    await hooks.close[0]!()
  })

  it('waits for an in-progress snapshot backup before closing SQLite', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const writeStarted = Promise.withResolvers<void>()
    const releaseWrite = Promise.withResolvers<void>()
    const completed = vi.fn()
    const link = (index: number): Link => ({ id: `id-${index}`, slug: `slug-${index}`, url: 'https://example.com', createdAt: 1, updatedAt: 1, tags: [] })
    mocks.snapshot.mockReturnValue(Array.from({ length: 101 }, (_, index) => link(index)))
    mocks.write.mockImplementation(async (_area: string, _key: string, data: Uint8Array) => {
      writeStarted.resolve()
      await releaseWrite.promise
      const backup = JSON.parse(new TextDecoder().decode(data))
      expect(backup.count).toBe(101)
      expect(backup.links).toHaveLength(101)
      completed()
    })

    const hooks = await loadStoragePlugin({ siteToken: 'test-token', dataDir: '/unused-mocked-data' })
    vi.advanceTimersByTime(86_400_000)
    await writeStarted.promise
    const closing = hooks.close[0]!()
    try {
      await Promise.resolve()
      expect(mocks.closeDatabase).not.toHaveBeenCalled()
      expect(mocks.closeAnalytics).not.toHaveBeenCalled()
      expect(mocks.closeLinkCache).not.toHaveBeenCalled()
      expect(completed).not.toHaveBeenCalled()
    }
    finally {
      releaseWrite.resolve()
      await closing
    }
    expect(completed).toHaveBeenCalledOnce()
    expect(mocks.closeDatabase).toHaveBeenCalledOnce()
    expect(mocks.closeLinkCache).toHaveBeenCalledOnce()
    expect(completed.mock.invocationCallOrder[0]).toBeLessThan(mocks.closeLinkCache.mock.invocationCallOrder[0]!)
    expect(completed.mock.invocationCallOrder[0]).toBeLessThan(mocks.closeDatabase.mock.invocationCallOrder[0]!)
    vi.advanceTimersByTime(86_400_000)
    expect(mocks.snapshot).toHaveBeenCalledOnce()
  })
})
