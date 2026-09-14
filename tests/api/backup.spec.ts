import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteStoredLinks, fetch, postJson, server, useTestServer } from '../utils'

useTestServer()

describe('local link backups', () => {
  it('exports authoritative links to private backup files', async () => {
    const slug = `backup-${crypto.randomUUID()}`
    const link = { slug, url: 'https://example.com/backup', tags: ['backup-test'] }
    try {
      expect((await postJson('/api/link/create', link)).status).toBe(201)
      const response = await postJson('/api/backup', {})
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ success: true })
      const directory = join(server.dataDir, 'backups')
      const names = await readdir(directory)
      expect(names.length).toBeGreaterThan(0)
      const name = names.find(name => name.endsWith('.json'))!
      expect(name).toBeTruthy()
      const text = await readFile(join(directory, name), 'utf8')
      const backup = JSON.parse(text)
      expect(backup.links).toContainEqual(expect.objectContaining(link))
      expect(backup.count).toBe(backup.links.length)
      for (const path of [`/_assets/backups/${name}`, `/backups/${name}`, `/_assets/images/%2e%2e%2f%2e%2e%2fbackups/${name}`]) {
        const publicResponse = await fetch(path)
        expect(await publicResponse.text()).not.toContain(slug)
      }
      await server.restart()
      expect((await stat(join(directory, name))).size).toBeGreaterThan(0)
      expect(await readFile(join(directory, name), 'utf8')).toBe(text)
    }
    finally {
      await deleteStoredLinks([slug])
    }
  })

  it('requires authentication', async () => {
    expect((await postJson('/api/backup', {}, false)).status).toBe(401)
  })
})
