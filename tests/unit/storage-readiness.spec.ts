import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initializeDatabase: vi.fn(),
  closeDatabase: vi.fn(),
  getDatabase: vi.fn(),
  initializeLinkCache: vi.fn(),
  closeLinkCache: vi.fn(),
  initializeAnalytics: vi.fn(),
  closeAnalytics: vi.fn(),
  startAutomaticBackups: vi.fn(),
  stopAutomaticBackups: vi.fn(),
  drainWebhookDeliveries: vi.fn(),
  createError: vi.fn((input: { status?: number, statusText?: string }) => Object.assign(new Error(input.statusText), { statusCode: input.status })),
  sendError: vi.fn(),
}))

const duckdb = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('../../server/database/sqlite', () => ({
  initializeDatabase: mocks.initializeDatabase,
  closeDatabase: mocks.closeDatabase,
  getDatabase: mocks.getDatabase,
}))
vi.mock('../../server/database/analytics', () => ({
  initializeAnalytics: mocks.initializeAnalytics,
  closeAnalytics: mocks.closeAnalytics,
}))
vi.mock('../../server/services/link-store/cache', () => ({
  initializeLinkCache: mocks.initializeLinkCache,
  closeLinkCache: mocks.closeLinkCache,
}))
vi.mock('@duckdb/node-api', () => ({
  DuckDBInstance: { create: duckdb.create },
}))
// Keeps the real backup module off disk, so a leaked schedule would still reach
// SQLite and fail the unhealthy-process assertions.
vi.mock('../../server/utils/files', () => ({
  storageDirectory: vi.fn(async () => '/unused-mocked-backups'),
  writeStoredFile: vi.fn(async (_area: string, _key: string, _data: Uint8Array) => {}),
  readStoredImage: vi.fn(),
}))

interface PluginHooks {
  close: Array<() => Promise<void>>
  request: Array<(event: unknown) => Promise<void>>
}

async function loadPlugin(
  config: Record<string, unknown> = { siteToken: 'test-token', dataDir: '/unused-mocked-data' },
  automaticBackups: () => void = mocks.startAutomaticBackups,
): Promise<PluginHooks> {
  vi.resetModules()
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('startAutomaticBackups', automaticBackups)
  vi.stubGlobal('stopAutomaticBackups', mocks.stopAutomaticBackups)
  vi.stubGlobal('drainWebhookDeliveries', mocks.drainWebhookDeliveries)
  vi.stubGlobal('createError', mocks.createError)
  vi.stubGlobal('sendError', mocks.sendError)
  const { default: plugin } = await import('../../server/plugins/00.storage')
  const hooks: PluginHooks = { close: [], request: [] }
  ;(plugin as unknown as (app: unknown) => void)({
    hooks: {
      hook: (name: keyof PluginHooks, callback: never) => {
        hooks[name].push(callback)
      },
    },
  })
  return hooks
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('storage readiness', () => {
  it('waits for every store and starts automatic backups once after a successful initialization', async () => {
    const analytics = Promise.withResolvers<void>()
    mocks.initializeLinkCache.mockReturnValue(undefined)
    mocks.initializeAnalytics.mockReturnValue(analytics.promise)

    const hooks = await loadPlugin()
    expect(hooks.close).toHaveLength(1)
    expect(hooks.request).toHaveLength(1)
    expect(mocks.initializeDatabase).toHaveBeenCalledOnce()
    expect(mocks.initializeLinkCache).toHaveBeenCalledOnce()
    expect(mocks.startAutomaticBackups).not.toHaveBeenCalled()

    let settled = false
    const request = hooks.request[0]!({ handled: false }).then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    expect(mocks.startAutomaticBackups).not.toHaveBeenCalled()

    analytics.resolve()
    await request
    expect(settled).toBe(true)
    expect(mocks.sendError).not.toHaveBeenCalled()
    expect(mocks.startAutomaticBackups).toHaveBeenCalledOnce()
  })

  it('records SQLite failures, never starts backups, answers 503, and leaves no unhandled rejection', async () => {
    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandledRejection)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.initializeDatabase.mockImplementationOnce(() => {
      throw new Error('sqlite unavailable')
    })

    try {
      const hooks = await loadPlugin()
      const event = { handled: false }
      await hooks.request[0]!(event)

      expect(logged).toHaveBeenCalledWith('[storage] SQLite initialization failed; requests keep returning 503 until restart.', expect.any(Error))
      expect(mocks.createError).toHaveBeenCalledWith({ status: 503, statusText: 'Storage unavailable' })
      expect(mocks.sendError).toHaveBeenCalledOnce()
      expect(mocks.startAutomaticBackups).not.toHaveBeenCalled()
      expect(mocks.initializeLinkCache).not.toHaveBeenCalled()
      expect(mocks.initializeAnalytics).not.toHaveBeenCalled()
      const [sentEvent, sentError] = mocks.sendError.mock.calls[0]!
      expect(sentEvent).toBe(event)
      expect(sentError.statusCode).toBe(503)

      // Failed initialization must release every opened store exactly once.
      expect(mocks.closeLinkCache).toHaveBeenCalledOnce()
      expect(mocks.closeAnalytics).toHaveBeenCalledOnce()
      expect(mocks.closeDatabase).toHaveBeenCalledOnce()

      await new Promise(resolve => setTimeout(resolve, 0))
    }
    finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
    expect(unhandled).toEqual([])
  })

  it('stays healthy and starts backups when only DuckDB fails to initialize', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errored = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.initializeLinkCache.mockResolvedValue(undefined)
    mocks.initializeAnalytics.mockRejectedValueOnce(new Error('duckdb unavailable'))

    const hooks = await loadPlugin()
    await hooks.request[0]!({ handled: false })
    await hooks.request[0]!({ handled: false })

    expect(warned).toHaveBeenCalledOnce()
    expect(warned).toHaveBeenCalledWith('[analytics] DuckDB initialization failed; analytics APIs keep returning 503 until restart.', expect.any(Error))
    expect(errored).not.toHaveBeenCalled()
    expect(mocks.createError).not.toHaveBeenCalled()
    expect(mocks.sendError).not.toHaveBeenCalled()
    expect(mocks.startAutomaticBackups).toHaveBeenCalledOnce()
    // The healthy core must stay open for the lifetime of the process.
    expect(mocks.closeLinkCache).not.toHaveBeenCalled()
    expect(mocks.closeAnalytics).not.toHaveBeenCalled()
    expect(mocks.closeDatabase).not.toHaveBeenCalled()
  })

  it('closes in backup, webhook, cache, analytics, sqlite order exactly once', async () => {
    const analytics = Promise.withResolvers<void>()
    mocks.initializeLinkCache.mockResolvedValue(undefined)
    mocks.initializeAnalytics.mockReturnValue(analytics.promise)
    const order: string[] = []
    mocks.stopAutomaticBackups.mockImplementation(async () => {
      order.push('backup')
    })
    mocks.drainWebhookDeliveries.mockImplementation(async () => {
      order.push('webhook')
    })
    mocks.closeLinkCache.mockImplementation(async () => {
      order.push('cache')
    })
    mocks.closeAnalytics.mockImplementation(async () => {
      order.push('analytics')
    })
    mocks.closeDatabase.mockImplementation(() => {
      order.push('database')
    })

    const hooks = await loadPlugin()
    const first = hooks.close[0]!()
    const second = hooks.close[0]!()
    expect(second).toBe(first)

    await Promise.resolve()
    expect(order).toEqual([])

    analytics.resolve()
    await first
    expect(order).toEqual(['backup', 'webhook', 'cache', 'analytics', 'database'])
    expect(mocks.closeLinkCache).toHaveBeenCalledOnce()
    expect(mocks.closeAnalytics).toHaveBeenCalledOnce()
    expect(mocks.closeDatabase).toHaveBeenCalledOnce()
  })

  it('does not close stores twice when shutdown follows a failed SQLite initialization', async () => {
    mocks.initializeDatabase.mockImplementationOnce(() => {
      throw new Error('sqlite unavailable')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const hooks = await loadPlugin()
    await hooks.request[0]!({ handled: false })
    await hooks.close[0]!()

    expect(mocks.closeLinkCache).toHaveBeenCalledOnce()
    expect(mocks.closeAnalytics).toHaveBeenCalledOnce()
    expect(mocks.closeDatabase).toHaveBeenCalledOnce()
    expect(mocks.stopAutomaticBackups).toHaveBeenCalledOnce()
    expect(mocks.drainWebhookDeliveries).toHaveBeenCalledOnce()
  })

  it('does not start automatic backups when disableAutoBackup is set', async () => {
    mocks.initializeLinkCache.mockResolvedValue(undefined)
    mocks.initializeAnalytics.mockResolvedValue(undefined)

    const hooks = await loadPlugin({ siteToken: 'test-token', dataDir: '/unused-mocked-data', disableAutoBackup: true })
    await hooks.request[0]!({ handled: false })
    await hooks.close[0]!()

    expect(mocks.initializeDatabase).toHaveBeenCalledOnce()
    expect(mocks.initializeLinkCache).toHaveBeenCalledOnce()
    expect(mocks.initializeAnalytics).toHaveBeenCalledOnce()
    expect(mocks.sendError).not.toHaveBeenCalled()
    expect(mocks.startAutomaticBackups).not.toHaveBeenCalled()
  })

  it('keeps a process with a failed SQLite store from lazily reopening it when the backup schedule would have fired', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.initializeDatabase.mockImplementationOnce(() => {
      throw new Error('sqlite unavailable')
    })
    mocks.initializeLinkCache.mockResolvedValue(undefined)
    const { startAutomaticBackups } = await import('../../server/utils/backup')

    const hooks = await loadPlugin(undefined, startAutomaticBackups)
    await hooks.request[0]!({ handled: false })

    await vi.advanceTimersByTimeAsync(86_400_000 * 3)
    expect(mocks.sendError).toHaveBeenCalledOnce()
    expect(mocks.startAutomaticBackups).not.toHaveBeenCalled()
    expect(mocks.getDatabase).not.toHaveBeenCalled()
  })
})

describe('site token generation', () => {
  const requestEvent = () => ({ context: {} as Record<string, unknown>, handled: false })

  it('generates a process-local token when unset and never reveals it', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ]

    mocks.initializeLinkCache.mockResolvedValue(undefined)
    mocks.initializeAnalytics.mockResolvedValue(undefined)
    const hooks = await loadPlugin({ siteToken: '', dataDir: '/unused-mocked-data', disableAutoBackup: true })
    const event = requestEvent()
    await hooks.request[0]!(event)
    const token = event.context.generatedSiteToken as string

    expect(token).toMatch(/^[\w-]{43}$/)
    for (const spy of spies) {
      for (const call of spy.mock.calls)
        expect(call.map(value => String(value)).join(' ')).not.toContain(token)
    }
    expect(mocks.sendError).not.toHaveBeenCalled()
  })

  it('generates a different token for every process', async () => {
    mocks.initializeLinkCache.mockResolvedValue(undefined)
    mocks.initializeAnalytics.mockResolvedValue(undefined)
    const firstHooks = await loadPlugin({ siteToken: '', dataDir: '/unused-mocked-data', disableAutoBackup: true })
    const secondHooks = await loadPlugin({ siteToken: '', dataDir: '/unused-mocked-data', disableAutoBackup: true })
    const firstEvent = requestEvent()
    const secondEvent = requestEvent()

    await firstHooks.request[0]!(firstEvent)
    await secondHooks.request[0]!(secondEvent)

    expect(firstEvent.context.generatedSiteToken).toMatch(/^[\w-]{43}$/)
    expect(firstEvent.context.generatedSiteToken).not.toBe(secondEvent.context.generatedSiteToken)
  })

  it('keeps a configured token out of the request context', async () => {
    mocks.initializeLinkCache.mockResolvedValue(undefined)
    mocks.initializeAnalytics.mockResolvedValue(undefined)
    const hooks = await loadPlugin({ siteToken: 'test-token', dataDir: '/unused-mocked-data', disableAutoBackup: true })
    const event = requestEvent()

    await hooks.request[0]!(event)

    expect(event.context.generatedSiteToken).toBeUndefined()
  })

  it('rejects a configured token shorter than 8 characters', async () => {
    await expect(loadPlugin({ siteToken: 'short', dataDir: '/unused-mocked-data', disableAutoBackup: true }))
      .rejects
      .toThrow('NUXT_SITE_TOKEN must be at least 8 characters')
  })

  it.each(['        ', 'valid token 12345', '\tvalid-token-123', 'valid-token-123\n'])(
    'rejects a configured token with whitespace: %j',
    async (siteToken) => {
      await expect(loadPlugin({ siteToken, dataDir: '/unused-mocked-data', disableAutoBackup: true }))
        .rejects
        .toThrow('NUXT_SITE_TOKEN must not contain whitespace')
    },
  )
})

describe('analytics connection lifecycle', () => {
  async function importRealAnalytics() {
    vi.resetModules()
    vi.doUnmock('../../server/database/analytics')
    duckdb.create.mockReset()
    return import('../../server/database/analytics')
  }

  it('rejects queries with a unified unavailable error before initialization without opening DuckDB', async () => {
    const analytics = await importRealAnalytics()

    await expect(analytics.queryAnalytics('select 1')).rejects.toBeInstanceOf(analytics.AnalyticsUnavailableError)
    await expect(analytics.runAnalytics('select 1')).rejects.toBeInstanceOf(analytics.AnalyticsUnavailableError)
    expect(duckdb.create).not.toHaveBeenCalled()
  })

  it('closes the database handle when opening fails and the client close throws too', async () => {
    const run = vi.fn(async () => {
      throw new Error('table creation failed')
    })
    const closeConnection = vi.fn(() => {
      throw new Error('connection close failed')
    })
    const closeInstance = vi.fn()
    const dataDir = await mkdtemp(join(tmpdir(), 'slite-analytics-unit-'))

    try {
      const analytics = await importRealAnalytics()
      duckdb.create.mockResolvedValue({
        connect: vi.fn(async () => ({ run, runAndReadAll: vi.fn(), closeSync: closeConnection })),
        closeSync: closeInstance,
      })

      // The initialization error must survive both failing cleanup closes.
      await expect(analytics.initializeAnalytics(dataDir)).rejects.toThrow('table creation failed')
      expect(closeConnection).toHaveBeenCalledOnce()
      expect(closeInstance).toHaveBeenCalledOnce()

      // Failed initialization must stay unavailable instead of lazily reopening.
      await expect(analytics.runAnalytics('select 1')).rejects.toBeInstanceOf(analytics.AnalyticsUnavailableError)
      expect(duckdb.create).toHaveBeenCalledOnce()
    }
    finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('detaches and closes both handles even when one close throws, then refuses queries', async () => {
    const run = vi.fn(async () => {})
    const closeConnection = vi.fn(() => {
      throw new Error('connection close failed')
    })
    const closeInstance = vi.fn()
    const dataDir = await mkdtemp(join(tmpdir(), 'slite-analytics-unit-'))

    try {
      const analytics = await importRealAnalytics()
      duckdb.create.mockResolvedValue({
        connect: vi.fn(async () => ({ run, runAndReadAll: vi.fn(), closeSync: closeConnection })),
        closeSync: closeInstance,
      })
      await analytics.initializeAnalytics(dataDir)

      await expect(analytics.closeAnalytics()).rejects.toThrow('connection close failed')
      expect(closeConnection).toHaveBeenCalledOnce()
      expect(closeInstance).toHaveBeenCalledOnce()

      // Closed analytics must stay unavailable instead of lazily reopening.
      await expect(analytics.runAnalytics('select 1')).rejects.toBeInstanceOf(analytics.AnalyticsUnavailableError)
      expect(duckdb.create).toHaveBeenCalledOnce()
      expect(run).toHaveBeenCalledOnce()
    }
    finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  })
})
