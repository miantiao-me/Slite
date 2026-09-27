import { afterEach, describe, expect, it } from 'vitest'
import { deleteStoredLinks, fetch, postJson, server, useTestServer } from './utils'

const createdSlugs: string[] = []

useTestServer()

// Public runtime config is read when the child process starts, so toggling an
// env var requires a restart rather than mutating an env object.
afterEach(async () => {
  await server.restart()
  await deleteStoredLinks(createdSlugs.splice(0))
})

describe('public runtime config overrides', () => {
  it('keeps the homepage and stores the proxy flag by default', async () => {
    const home = await fetch('/', { redirect: 'manual' })
    expect(home.headers.get('location')).not.toBe('https://home.example.com')

    // The flag only governs request-time delivery; writes always store it.
    const slug = `cfg-default-${crypto.randomUUID()}`
    createdSlugs.push(slug)
    const created = await postJson('/api/link/create', {
      url: 'https://example.com/proxy-default',
      slug,
      proxy: true,
    })
    expect(created.status).toBe(201)
    const data = await created.json() as { link: { proxy?: boolean } }
    expect(data.link.proxy).toBe(true)
  })

  it('redirects / when NUXT_PUBLIC_HOME_URL is set', async () => {
    await server.restart({ NUXT_PUBLIC_HOME_URL: 'https://home.example.com' })

    const response = await fetch('/', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://home.example.com')
  })

  it('still honors the deprecated NUXT_HOME_URL', async () => {
    await server.restart({ NUXT_HOME_URL: 'https://legacy-home.example.com' })

    const response = await fetch('/', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://legacy-home.example.com')
  })
})
