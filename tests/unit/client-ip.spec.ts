import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestClientIp } from '../../server/utils/client-ip'

function createRequestEvent(remoteAddress: string, headers: Record<string, string> = {}) {
  const request = new IncomingMessage(new Socket())
  request.url = '/'
  request.headers = headers
  Object.defineProperty(request.socket, 'remoteAddress', { value: remoteAddress, configurable: true })
  return createEvent(request, new ServerResponse(request))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request client ip proxy trust', () => {
  it('ignores forwarded addresses when proxy trust is disabled', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: false }))
    const event = createRequestEvent('203.0.113.7', { 'x-forwarded-for': '198.51.100.9' })

    expect(requestClientIp(event)).toBe('203.0.113.7')
  })

  it('uses the first forwarded address when proxy trust is enabled', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: true }))
    const event = createRequestEvent('127.0.0.1', { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' })

    expect(requestClientIp(event)).toBe('198.51.100.9')
  })

  it('falls back to the socket address when no forwarded address is present', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: true }))
    const event = createRequestEvent('203.0.113.7')

    expect(requestClientIp(event)).toBe('203.0.113.7')
  })
})

describe('request client ip custom header', () => {
  it('prefers the configured header over x-forwarded-for', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: false, clientIpHeader: 'cf-connecting-ip' }))
    const event = createRequestEvent('127.0.0.1', {
      'cf-connecting-ip': '198.51.100.9',
      'x-forwarded-for': '203.0.113.7',
    })

    expect(requestClientIp(event)).toBe('198.51.100.9')
  })

  it('uses the first entry when the configured header carries a list', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: false, clientIpHeader: 'x-real-ip' }))
    const event = createRequestEvent('127.0.0.1', { 'x-real-ip': ' 198.51.100.9, 10.0.0.1 ' })

    expect(requestClientIp(event)).toBe('198.51.100.9')
  })

  it('falls back to x-forwarded-for when the configured header is absent', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: true, clientIpHeader: 'cf-connecting-ip' }))
    const event = createRequestEvent('127.0.0.1', { 'x-forwarded-for': '198.51.100.9' })

    expect(requestClientIp(event)).toBe('198.51.100.9')
  })

  it('keeps the socket address when neither header is trusted', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy: false, clientIpHeader: '' }))
    const event = createRequestEvent('203.0.113.7', { 'x-forwarded-for': '198.51.100.9' })

    expect(requestClientIp(event)).toBe('203.0.113.7')
  })
})
