import { describe, expect, it } from 'vitest'
import { fetch, server, useTestServer } from '../utils'

useTestServer()

describe('/api/location', () => {
  it('stays public and omits missing coordinates', async () => {
    const response = await fetch('/api/location')

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toEqual({})
  })

  it('returns correct response structure', async () => {
    const response = await fetch('/api/location')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/json')
  })

  it('ignores proxy geolocation headers even when proxy trust is enabled', async () => {
    await server.restart({ NUXT_TRUST_PROXY: 'true' })
    try {
      const response = await fetch('/api/location', {
        headers: { 'cf-iplatitude': '37.7749', 'cf-iplongitude': '-122.4194' },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({})
    }
    finally {
      await server.restart()
    }
  })
})
