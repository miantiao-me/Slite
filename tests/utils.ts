import type { Link } from '../shared/schemas/link'
import { join } from 'node:path'
import { expect } from 'vitest'
import { LINK_PASSWORD_HASH_PREFIX, LINK_PASSWORD_MASK_PREFIX } from '../shared/utils/link-password'
import { TestServer } from './helpers/server'

export const server = new TestServer()

export function useTestServer() {
  server.requested = true
}

export function fetchWithAuth(path: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers)
  headers.set('Authorization', `Bearer ${server.token}`)
  return fetch(path, { ...options, headers })
}

export function fetch(path: string, options?: RequestInit): Promise<Response> {
  return globalThis.fetch(new URL(path, server.url), { redirect: 'manual', ...options })
}

export function postJson(path: string, body: unknown, withAuth = true): Promise<Response> {
  const fn = withAuth ? fetchWithAuth : fetch
  return fn(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function putJson(path: string, body: unknown, withAuth = true): Promise<Response> {
  const fn = withAuth ? fetchWithAuth : fetch
  return fn(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function getStoredLink(slug: string) {
  const response = await fetchWithAuth('/api/link/export')
  expect(response.status).toBe(200)
  const data = await response.json() as { links: Link[] }
  return data.links.find(link => link.slug === slug) ?? null
}

export async function deleteStoredLink(slug: string) {
  const response = await postJson('/api/link/delete', { slug })
  expect([200, 404]).toContain(response.status)
}

export async function deleteStoredLinks(slugs: string[]) {
  await Promise.all(slugs.map(slug => deleteStoredLink(slug)))
}

export async function expireStoredLink(slug: string) {
  await server.stop()
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(server.dataDir, 'slite.sqlite'))
  try {
    const expiredAt = Math.floor(Date.now() / 1000) - 60
    const result = db.prepare('UPDATE links SET expiration = ?, effective_expires_at = ? WHERE slug = ?').run(expiredAt, expiredAt, slug)
    expect(Number(result.changes)).toBe(1)
  }
  finally {
    db.close()
    await server.start()
  }
}

export function expectMaskedPassword(password: string | undefined, plainText: string) {
  expect(password).toBeDefined()
  expect(password?.startsWith(LINK_PASSWORD_MASK_PREFIX), password).toBe(true)
  expect(password).toContain(plainText.slice(-3))
  expect(password).not.toBe(plainText)
  expect(password?.startsWith(LINK_PASSWORD_HASH_PREFIX)).toBe(false)
}

export async function expectStoredHashedPassword(slug: string, plainText: string) {
  const storedLink = await getStoredLink(slug)
  expect(storedLink?.password?.startsWith(LINK_PASSWORD_HASH_PREFIX), storedLink?.password).toBe(true)
  expect(storedLink?.password).not.toBe(plainText)
}

// 1x1 transparent PNG for testing
export const TEST_PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x0D,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1F,
  0x15,
  0xC4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0A,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9C,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0D,
  0x0A,
  0x2D,
  0xB4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4E,
  0x44,
  0xAE,
  0x42,
  0x60,
  0x82,
])
