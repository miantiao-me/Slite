import { randomBytes } from 'node:crypto'
import { closeAnalytics, initializeAnalytics } from '../database/analytics'
import { closeDatabase, initializeDatabase } from '../database/sqlite'
import { closeGeo, initializeGeo } from '../services/geo'
import { closeLinkCache, initializeLinkCache } from '../services/link-store/cache'

// Nitro invokes plugins without awaiting them, so startup state is tracked with
// a promise: synchronous validation still aborts startup, while every request
// waits for storage initialization before it is handled. SQLite is the only
// required store; the link cache, GeoIP, and DuckDB each degrade on their own,
// so only a SQLite failure makes the whole process answer 503.
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender)
    return

  const config = useRuntimeConfig()
  // An unset or empty token becomes a process-only random token: public
  // redirects keep working, while dashboard and API requests can never be
  // authenticated. The generated value is never logged or persisted, and the
  // middleware reads it from each request context instead of the frozen config.
  // A configured token must not contain whitespace and must be at least 8
  // characters long.
  const configuredSiteToken = String(config.siteToken || '')
  const generatedSiteToken = configuredSiteToken ? '' : randomBytes(32).toString('base64url')

  if (configuredSiteToken && /\s/.test(configuredSiteToken))
    throw new Error('NUXT_SITE_TOKEN must not contain whitespace')

  if (configuredSiteToken && configuredSiteToken.length < 8)
    throw new Error('NUXT_SITE_TOKEN must be at least 8 characters')

  const { promise: ready, resolve: settleReady } = Promise.withResolvers<void>()
  let failed = false
  let resourcesClosed = false
  let closing: Promise<void> | undefined

  async function closeResources(): Promise<void> {
    if (resourcesClosed)
      return
    resourcesClosed = true
    try {
      await closeLinkCache()
    }
    finally {
      try {
        await closeAnalytics()
      }
      finally {
        try {
          closeDatabase()
        }
        finally {
          closeGeo()
        }
      }
    }
  }

  function closeStorage(): Promise<void> {
    closing ??= (async () => {
      // Shutdown can race initialization; wait until every store has settled.
      await ready
      try {
        await stopAutomaticBackups()
        await drainWebhookDeliveries()
      }
      finally {
        await closeResources()
      }
    })()
    return closing
  }

  // Registered before initialization starts so a close during startup waits.
  nitroApp.hooks.hook('close', closeStorage)

  nitroApp.hooks.hook('request', async (event) => {
    if (generatedSiteToken)
      event.context.generatedSiteToken = generatedSiteToken
    await ready
    if (!failed)
      return
    sendError(event, createError({
      status: 503,
      statusText: 'Storage unavailable',
    }))
  })

  async function initializeStorage(): Promise<void> {
    try {
      initializeDatabase(config.dataDir)
    }
    catch (error) {
      failed = true
      console.error('[storage] SQLite initialization failed; requests keep returning 503 until restart.', error)
      try {
        await closeResources()
      }
      catch (closeError) {
        console.error('[storage] Failed to release storage resources.', closeError)
      }
      settleReady()
      return
    }

    // SQLite is ready, so requests stay healthy from here on. The link cache
    // and GeoIP lookups are optional and already fail open.
    initializeLinkCache()
    try {
      await initializeAnalytics(config.dataDir)
    }
    catch (error) {
      // DuckDB backs analytics only: links, redirects, and the dashboard stay
      // available while stats and logs answer 503 until the next restart.
      console.warn('[analytics] DuckDB initialization failed; analytics APIs keep returning 503 until restart.', error)
    }
    await initializeGeo(config)

    // Backups start only after the required store is ready, and before readiness
    // settles so a concurrent shutdown always observes and stops the timer.
    // A failed SQLite initialization never reaches this point: an unhealthy
    // process must not lazily reopen SQLite when the schedule fires.
    if (!config.disableAutoBackup)
      startAutomaticBackups()
    settleReady()
  }

  void initializeStorage()
})
