import type { VerifyResponse } from '../../shared/types/auth'
import { describe, expect, it } from 'vitest'
import { TestServer } from '../helpers/server'
import { fetch, fetchWithAuth, server, useTestServer } from '../utils'

useTestServer()

describe('site token startup validation', () => {
  it('refuses to start with a site token shorter than 8 characters', async () => {
    const { code, logs } = await server.startExpectingFailure({ NUXT_SITE_TOKEN: 'short' })

    expect(code).not.toBe(0)
    expect(logs).toContain('NUXT_SITE_TOKEN must be at least 8 characters')
  })

  it.each([
    ['spaces around the token', '  valid-token-123  '],
    ['an embedded space', 'valid token 12345'],
    ['only whitespace', '        '],
    ['a tab', '\tvalid-token-123'],
    ['a trailing newline', 'valid-token-123\n'],
  ])('refuses to start with %s in NUXT_SITE_TOKEN', async (_case, siteToken) => {
    const { code, logs } = await server.startExpectingFailure({ NUXT_SITE_TOKEN: siteToken })

    expect(code).not.toBe(0)
    expect(logs).toContain('NUXT_SITE_TOKEN must not contain whitespace')
  })

  it('starts without a site token, serves the public page, and rejects every token', async () => {
    const tokenless = new TestServer()
    try {
      // Readiness uses the default token and expects a rejection: the random
      // process token must not authenticate any request.
      await tokenless.start({ NUXT_SITE_TOKEN: '' }, 401)

      const page = await globalThis.fetch(new URL('/', tokenless.url))
      expect(page.status).toBe(200)

      for (const authorization of [`Bearer ${tokenless.token}`, 'Bearer another-random-token', undefined]) {
        const response = await globalThis.fetch(new URL('/api/verify', tokenless.url), authorization ? { headers: { Authorization: authorization } } : {})
        expect(response.status).toBe(401)
      }
    }
    finally {
      await tokenless.dispose()
    }
  })
})

describe('/api/verify', () => {
  it.each([
    ['/api/link/list', 'GET'],
    ['/api/link/create', 'POST'],
    ['/api/link/edit', 'PUT'],
    ['/api/link/delete', 'POST'],
    ['/api/link/import', 'POST'],
    ['/api/link/export', 'GET'],
    ['/api/link/ai', 'GET'],
    ['/api/link/og-ai', 'GET'],
    ['/api/stats/counters', 'GET'],
    ['/api/logs/events', 'GET'],
    ['/api/upload/image', 'POST'],
    ['/api/backup', 'POST'],
  ])('guards %s before processing its request', async (path, method) => {
    expect((await fetch(path, { method })).status).toBe(401)
    expect((await fetch(path, { method, headers: { Authorization: 'Basic invalid' } })).status).toBe(401)
  })

  it('returns the expected verification data with valid auth', async () => {
    const response = await fetchWithAuth('/api/verify')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/json')

    const data = await response.json() as VerifyResponse
    expect(data).toMatchObject({
      name: 'Slite',
      authMethod: 'site-token',
      userID: 'root',
      userEmail: 'root@127.0.0.1',
      accessEnabled: false,
    })
    expect(data.url).toBe(server.url)
  })

  it('returns 401 when accessing without auth', async () => {
    const response = await fetch('/api/verify')
    expect(response.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const response = await fetch('/api/verify', {
      headers: { Authorization: 'Bearer invalid-token-12345' },
    })
    expect(response.status).toBe(401)
  })

  it('does not trust an Access header when Access is not configured', async () => {
    const response = await fetch('/api/verify', {
      headers: { 'Cf-Access-Jwt-Assertion': 'unsigned-token' },
    })
    expect(response.status).toBe(401)
  })

  it('does not trust an Access cookie when Access is not configured', async () => {
    const response = await fetch('/api/verify', {
      headers: { Cookie: 'CF_Authorization=unsigned-token' },
    })
    expect(response.status).toBe(401)
  })
})
