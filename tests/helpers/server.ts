import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

export class TestServer {
  requested = false
  token = 'slite-integration-test-token'
  dataDir = ''
  url = ''
  logs = ''
  private child?: ChildProcess

  async start(overrides: Record<string, string> = {}, expectedStatus = 200) {
    if (this.child)
      return
    this.assertNodeVersion()
    const entry = resolve(process.env.SLITE_TEST_ENTRY || '.output/server/index.mjs')
    await access(entry)
    this.dataDir ||= await mkdtemp(join(tmpdir(), 'slite-test-'))
    const port = await this.allocatePort()
    this.url = `http://127.0.0.1:${port}`
    this.logs = ''
    const child = spawn(process.execPath, [entry], {
      env: this.childEnv({ PORT: String(port), NITRO_PORT: String(port), ...overrides }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    let spawnError: Error | undefined
    child.on('error', (error) => {
      spawnError = error
    })
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', (chunk) => {
        this.logs = (this.logs + chunk.toString()).slice(-64_000)
      })
    }
    try {
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline) {
        if (spawnError || child.exitCode !== null)
          throw spawnError || new Error(`Server exited: ${child.exitCode}`)
        try {
          const response = await globalThis.fetch(`${this.url}/api/verify`, {
            headers: { Authorization: `Bearer ${this.token}` },
            signal: AbortSignal.timeout(1000),
          })
          if (response.status === expectedStatus)
            return
        }
        catch {}
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      throw new Error('Server readiness timed out')
    }
    catch (error) {
      await this.stop()
      throw new Error(`${error}\n${this.logs}`)
    }
  }

  async startExpectingFailure(overrides: Record<string, string> = {}, timeout = 15_000) {
    this.assertNodeVersion()
    const entry = resolve(process.env.SLITE_TEST_ENTRY || '.output/server/index.mjs')
    await access(entry)
    this.dataDir ||= await mkdtemp(join(tmpdir(), 'slite-test-'))
    const port = await this.allocatePort()
    const child = spawn(process.execPath, [entry], {
      env: this.childEnv({ PORT: String(port), NITRO_PORT: String(port), ...overrides }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', (chunk) => {
        logs = (logs + chunk.toString()).slice(-64_000)
      })
    }
    const exited = await Promise.race([
      once(child, 'exit').then(([code, signal]) => ({ code: code as number | null, signal: signal as NodeJS.Signals | null })),
      new Promise<null>((resolve) => {
        setTimeout(resolve, timeout, null).unref()
      }),
    ])
    if (!exited) {
      child.kill('SIGKILL')
      throw new Error(`Server did not exit within ${timeout}ms\n${logs}`)
    }
    return { code: exited.code, signal: exited.signal, logs }
  }

  async stop() {
    const child = this.child
    if (!child)
      return
    this.child = undefined
    if (child.exitCode !== null || child.signalCode !== null)
      return
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    try {
      await exited
    }
    finally {
      clearTimeout(timer)
    }
  }

  async restart(overrides: Record<string, string> = {}) {
    await this.stop()
    await this.start(overrides)
  }

  async dispose() {
    await this.stop()
    if (this.dataDir)
      await rm(this.dataDir, { recursive: true, force: true })
    this.dataDir = ''
  }

  private assertNodeVersion() {
    if (Number(process.versions.node.split('.')[0]) < 24)
      throw new Error('Integration tests require Node.js 24+. Run Vitest with the same Node version as the production server.')
  }

  private childEnv(overrides: Record<string, string>) {
    return {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      NITRO_HOST: '127.0.0.1',
      NUXT_DATA_DIR: this.dataDir,
      NUXT_SITE_TOKEN: this.token,
      NUXT_GEOIP_PATH: '',
      NUXT_DISABLE_AUTO_BACKUP: 'true',
      NUXT_SAFE_BROWSING_DOH: '',
      NUXT_WEBHOOK_URL: '',
      NUXT_AI_API_KEY: '',
      NUXT_AI_BASE_URL: '',
      NUXT_AI_MODEL: '',
      NUXT_TRUST_PROXY: 'false',
      NUXT_PUBLIC_PREVIEW_MODE: '',
      ...overrides,
    }
  }

  private async allocatePort(): Promise<number> {
    const listener = createServer()
    listener.listen(0, '127.0.0.1')
    await once(listener, 'listening')
    const address = listener.address()
    if (!address || typeof address === 'string')
      throw new Error('Could not allocate test port')
    const port = address.port
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
    return port
  }
}
