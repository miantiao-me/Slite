import type { H3Event } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, getHeader } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectAccessLog, writeAccessLog } from '../../server/utils/access-log'

const mocks = vi.hoisted(() => ({
  lookupGeo: vi.fn(),
  runAnalytics: vi.fn(),
}))

vi.mock('../../server/services/geo', () => ({ lookupGeo: mocks.lookupGeo }))
vi.mock('../../server/database/analytics', () => ({ runAnalytics: mocks.runAnalytics }))

function createRequestEvent(headers: Record<string, string> = {}, remoteAddress = '203.0.113.7'): H3Event {
  const request = new IncomingMessage(new Socket())
  request.url = '/example'
  request.method = 'GET'
  request.headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ...headers }
  Object.defineProperty(request.socket, 'remoteAddress', { value: remoteAddress, configurable: true })
  const event = createEvent(request, new ServerResponse(request))
  event.context.link = { id: 'link-id', slug: 'example', url: 'https://example.com' }
  return event
}

beforeEach(() => {
  vi.stubGlobal('getHeader', getHeader)
  vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: false, disableBotAccessLog: false }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('access log geo fields', () => {
  it('fills country, region, city, and coordinates from the geo lookup', () => {
    mocks.lookupGeo.mockReturnValue({
      country: 'DE',
      region: 'Bavaria',
      city: 'Munich',
      latitude: 48.1372,
      longitude: 11.5756,
    })

    const result = collectAccessLog(createRequestEvent({ 'accept-language': 'de-DE,de;q=0.9', 'referer': 'https://news.example/article' }))

    expect(mocks.lookupGeo).toHaveBeenCalledWith('203.0.113.7')
    expect(result?.logs).toMatchObject({
      country: 'DE',
      region: 'Bavaria',
      city: 'Munich',
      timezone: '',
      latitude: 48.1372,
      longitude: 11.5756,
      language: 'de-DE',
      referer: 'news.example',
    })
    expect(result?.click).toMatchObject({
      country: 'DE',
      region: 'Bavaria',
      city: 'Munich',
    })
  })

  it('keeps geographic fields empty when no location is available', () => {
    mocks.lookupGeo.mockReturnValue(undefined)

    const result = collectAccessLog(createRequestEvent())

    expect(result?.logs).toMatchObject({
      country: '',
      region: '',
      city: '',
      timezone: '',
    })
    expect(result?.logs.latitude).toBeUndefined()
    expect(result?.logs.longitude).toBeUndefined()
    expect(result?.click.country).toBe('')
  })

  it('looks up the forwarded address only when proxy trust is enabled', () => {
    mocks.lookupGeo.mockReturnValue(undefined)
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: true, disableBotAccessLog: false }))

    collectAccessLog(createRequestEvent({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }))

    expect(mocks.lookupGeo).toHaveBeenCalledWith('198.51.100.9')
  })

  it('skips the geo lookup when bot access logging is disabled', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: false, disableBotAccessLog: true }))
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = collectAccessLog(createRequestEvent({ 'user-agent': 'Twitterbot/1.0' }))

    expect(result).toBeUndefined()
    expect(mocks.lookupGeo).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalled()
  })
})

describe('access log DuckDB write mapping', () => {
  it('writes the named blob and double columns and leaves missing coordinates null', async () => {
    await writeAccessLog(createRequestEvent(), {
      slug: 'example',
      url: 'https://example.com',
      ua: 'Mozilla/5.0',
      ip: '203.0.113.7',
      referer: 'news.example',
      country: 'DE',
      region: 'Bavaria',
      city: 'Munich',
      timezone: '',
      language: 'de-DE',
      os: 'Windows',
      browser: 'Chrome',
      browserType: 'browser',
      device: 'PC',
      deviceType: 'desktop',
    })

    expect(mocks.runAnalytics).toHaveBeenCalledOnce()
    const [sql, parameters] = mocks.runAnalytics.mock.calls[0]!
    expect(sql).toBe('INSERT INTO access_events (event_id, index1, timestamp, blob1, blob2, blob3, blob4, blob5, blob6, blob7, blob8, blob9, blob10, blob11, blob12, blob13, blob14, blob15, double1, double2) VALUES (?, ?, to_timestamp(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    expect(sql).not.toContain('blob16')
    expect(parameters[0]).toMatch(/^[\da-f-]{36}$/)
    expect(parameters.slice(1)).toEqual([
      'link-id',
      expect.any(Number),
      'example',
      'https://example.com',
      'Mozilla/5.0',
      '203.0.113.7',
      'news.example',
      'DE',
      'Bavaria',
      'Munich',
      '',
      'de-DE',
      'Windows',
      'Chrome',
      'browser',
      'PC',
      'desktop',
      null,
      null,
    ])
  })
})
