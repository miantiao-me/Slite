import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchWithAuth, server, useTestServer } from '../utils'

useTestServer()

type ProviderMode = 'success' | 'error' | 'malformed'
let mode: ProviderMode = 'success'
interface ProviderRequest {
  path: string
  authorization?: string
  body: { model: string, messages: { role: string, content: string }[] }
}
const providerRequests: ProviderRequest[] = []
const pageRequests: string[] = []
const stub = createServer(async (request, response) => {
  if (request.method !== 'POST') {
    pageRequests.push(request.url!)
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end('<html><title>Local fixture</title><body>Fixture content</body></html>')
    return
  }
  const chunks: Buffer[] = []
  for await (const chunk of request)
    chunks.push(Buffer.from(chunk))
  const body = JSON.parse(Buffer.concat(chunks).toString())
  providerRequests.push({ path: request.url!, authorization: request.headers.authorization, body })
  response.setHeader('Content-Type', 'application/json')
  if (mode === 'error') {
    response.writeHead(503)
    response.end(JSON.stringify({ error: { message: 'Local provider unavailable', type: 'server_error' } }))
    return
  }
  const content = mode === 'malformed' ? 'not JSON' : JSON.stringify({ slug: 'local-ai-slug', title: 'Local AI title', description: 'Local AI description' })
  response.end(JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1,
    model: 'local-test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
})
const aiRoutes = ['ai', 'og-ai'] as const
let baseURL = ''
let pageURL = ''

beforeAll(async () => {
  stub.listen(0, '127.0.0.1')
  await once(stub, 'listening')
  const address = stub.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing stub address')
  baseURL = `http://127.0.0.1:${address.port}`
  pageURL = `${baseURL}/fallback-slug`
})

afterAll(async () => {
  stub.closeAllConnections()
  await new Promise<void>((resolve, reject) => stub.close(error => error ? reject(error) : resolve()))
})

describe('without a configured AI provider', () => {
  beforeAll(async () => {
    await server.restart({ NUXT_AI_BASE_URL: '', NUXT_AI_MODEL: '', NUXT_AI_API_KEY: '' })
  })

  it.each(aiRoutes)('returns 501 for %s before any outbound request', async (route) => {
    const pagesBefore = pageRequests.length
    const providersBefore = providerRequests.length
    const response = await fetchWithAuth(`/api/link/${route}?url=${encodeURIComponent(pageURL)}`)
    expect(response.status).toBe(501)
    expect(pageRequests.length).toBe(pagesBefore)
    expect(providerRequests.length).toBe(providersBefore)
  })
})

describe('openAI-compatible provider over HTTP', () => {
  beforeAll(async () => {
    await server.restart({ NUXT_AI_BASE_URL: `${baseURL}/v1/`, NUXT_AI_API_KEY: 'local-test-key', NUXT_AI_MODEL: 'local-test-model' })
  })

  it.each(aiRoutes)('uses the configured provider for %s without fetching the target URL', async (route) => {
    mode = 'success'
    const before = providerRequests.length
    const response = await fetchWithAuth(`/api/link/${route}?url=${encodeURIComponent(pageURL)}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(route === 'ai'
      ? { slug: 'local-ai-slug' }
      : { title: 'Local AI title', description: 'Local AI description' })
    expect(providerRequests.length).toBeGreaterThan(before)
    expect(providerRequests.at(-1)).toMatchObject({ path: '/v1/chat/completions', authorization: 'Bearer local-test-key', body: { model: 'local-test-model' } })
    expect(providerRequests.at(-1)?.body.messages.at(-1)?.content).toBe(pageURL)
    expect(pageRequests).toHaveLength(0)
  })

  it.each(['error', 'malformed'] as const)('falls back on both routes for %s provider responses', async (failure) => {
    mode = failure
    for (const route of aiRoutes) {
      const before = providerRequests.length
      const response = await fetchWithAuth(`/api/link/${route}?url=${encodeURIComponent(pageURL)}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(route === 'ai'
        ? { slug: 'fallback-slug' }
        : { title: '127.0.0.1', description: `Short link for ${pageURL}` })
      expect(providerRequests.length).toBeGreaterThan(before)
      expect(pageRequests).toHaveLength(0)
    }
  })
})

describe('openAI-compatible provider without an API key', () => {
  beforeAll(async () => {
    await server.restart({ NUXT_AI_BASE_URL: `${baseURL}/v1/`, NUXT_AI_API_KEY: '', NUXT_AI_MODEL: 'local-test-model' })
  })

  it.each(aiRoutes)('uses the configured provider for %s', async (route) => {
    mode = 'success'
    const before = providerRequests.length
    const response = await fetchWithAuth(`/api/link/${route}?url=${encodeURIComponent(pageURL)}`)
    expect(response.status).toBe(200)
    expect(providerRequests.length).toBeGreaterThan(before)
    expect(providerRequests.at(-1)).toMatchObject({ path: '/v1/chat/completions', body: { model: 'local-test-model' } })
    expect(providerRequests.at(-1)?.authorization).toBeUndefined()
    expect(pageRequests).toHaveLength(0)
  })
})
