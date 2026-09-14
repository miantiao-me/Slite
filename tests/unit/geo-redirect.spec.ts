import type { H3Event } from 'h3'
import type { GeoLocation } from '../../server/services/geo'
import type { Link } from '../../shared/schemas/link'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, getHeader, getQuery } from 'h3'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { selectGeoRedirectUrl } from '../../server/utils/geo-redirect'

const mocks = vi.hoisted(() => ({
  lookupGeo: vi.fn(),
  requestClientIp: vi.fn(() => '8.8.8.8'),
  getLink: vi.fn(),
  collectAccessLog: vi.fn(),
  writeAccessLog: vi.fn(),
  queueLinkClickedWebhook: vi.fn(),
  sendRedirect: vi.fn((_event: unknown, url: string, code: number) => ({ url, code })),
  setHeader: vi.fn(),
}))

vi.mock('../../server/services/geo', () => ({ lookupGeo: mocks.lookupGeo }))
vi.mock('../../server/utils/client-ip', () => ({ requestClientIp: mocks.requestClientIp }))

type RedirectHandler = (event: H3Event) => Promise<unknown>
let redirectHandler: RedirectHandler

const CN_LOCATION: GeoLocation = { country: 'CN', region: '', city: '', latitude: null, longitude: null }

function createLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'link-id',
    slug: 'geo-link',
    url: 'https://example.com/default',
    createdAt: 0,
    updatedAt: 0,
    tags: [],
    ...overrides,
  }
}

function createRequestEvent(path = '/geo-link', headers: Record<string, string> = {}): H3Event {
  const request = new IncomingMessage(new Socket())
  request.url = path
  request.method = 'GET'
  request.headers = { 'user-agent': 'Mozilla/5.0', ...headers }
  return createEvent(request, new ServerResponse(request))
}

beforeAll(async () => {
  vi.stubGlobal('eventHandler', (handler: RedirectHandler) => handler)
  vi.stubGlobal('getHeader', getHeader)
  vi.stubGlobal('getQuery', getQuery)
  vi.stubGlobal('setHeader', mocks.setHeader)
  vi.stubGlobal('sendRedirect', mocks.sendRedirect)
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusText ?? 'error')), input))
  vi.stubGlobal('useAppConfig', () => ({ slugRegex: /^[a-z0-9-]+$/, reserveSlug: [] }))
  vi.stubGlobal('useRuntimeConfig', () => ({
    homeURL: '',
    notFoundRedirect: '',
    caseSensitive: false,
    redirectWithQuery: false,
    redirectStatusCode: '301',
    redirectNoStore: false,
  }))
  vi.stubGlobal('getLink', mocks.getLink)
  vi.stubGlobal('collectAccessLog', mocks.collectAccessLog)
  vi.stubGlobal('writeAccessLog', mocks.writeAccessLog)
  vi.stubGlobal('queueLinkClickedWebhook', mocks.queueLinkClickedWebhook)
  redirectHandler = (await import('../../server/middleware/1.redirect')).default as RedirectHandler
})

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('geo redirect selection', () => {
  it('matches uppercase country keys and ignores everything else', () => {
    expect(selectGeoRedirectUrl({ geo: { CN: 'https://cn.example.com' } }, CN_LOCATION)).toBe('https://cn.example.com')
    expect(selectGeoRedirectUrl({ geo: { CN: 'https://cn.example.com' } }, { country: 'US' })).toBeUndefined()
    expect(selectGeoRedirectUrl({ geo: { CN: 'https://cn.example.com' } }, undefined)).toBeUndefined()
    expect(selectGeoRedirectUrl({}, CN_LOCATION)).toBeUndefined()
  })
})

describe('redirect middleware geo routing', () => {
  it('redirects to the country target when the geo lookup matches', async () => {
    mocks.getLink.mockResolvedValue(createLink({ geo: { CN: 'https://cn.example.com/landing' } }))
    mocks.lookupGeo.mockReturnValue(CN_LOCATION)

    await redirectHandler(createRequestEvent())

    expect(mocks.requestClientIp).toHaveBeenCalled()
    expect(mocks.lookupGeo).toHaveBeenCalledWith('8.8.8.8')
    expect(mocks.sendRedirect).toHaveBeenCalledWith(expect.anything(), 'https://cn.example.com/landing', 301)
  })

  it('falls back to the default target without a matching country', async () => {
    mocks.getLink.mockResolvedValue(createLink({ geo: { CN: 'https://cn.example.com/landing' } }))
    mocks.lookupGeo.mockReturnValue({ country: 'US', region: '', city: '', latitude: null, longitude: null })

    await redirectHandler(createRequestEvent())

    expect(mocks.sendRedirect).toHaveBeenCalledWith(expect.anything(), 'https://example.com/default', 301)
  })

  it('falls back to the default target when geo lookup is unavailable', async () => {
    mocks.getLink.mockResolvedValue(createLink({ geo: { CN: 'https://cn.example.com/landing' } }))
    mocks.lookupGeo.mockReturnValue(undefined)

    await redirectHandler(createRequestEvent())

    expect(mocks.sendRedirect).toHaveBeenCalledWith(expect.anything(), 'https://example.com/default', 301)
  })

  it('keeps device redirects ahead of geo routing', async () => {
    mocks.getLink.mockResolvedValue(createLink({
      apple: 'https://apps.apple.com/app/slite',
      geo: { CN: 'https://cn.example.com/landing' },
    }))
    mocks.lookupGeo.mockReturnValue(CN_LOCATION)

    await redirectHandler(createRequestEvent('/geo-link', {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/147 Mobile/15E148 Safari/604.1',
    }))

    expect(mocks.sendRedirect).toHaveBeenCalledWith(expect.anything(), 'https://apps.apple.com/app/slite', 301)
  })
})
