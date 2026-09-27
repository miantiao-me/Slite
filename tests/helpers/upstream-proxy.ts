import type { AddressInfo } from 'node:net'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'

export type UpstreamHandler = (request: Request) => Response | Promise<Response>

export interface UpstreamCall {
  host: string
  method: string
  request: Request
}

/**
 * The test server runs in a spawned child process, so its outbound `fetch`
 * calls cannot be mocked in-process. This stub is a plain HTTP forward proxy:
 * the child is started with `NODE_USE_ENV_PROXY=1` plus `HTTP_PROXY`, so its
 * undici fetch tunnels every request through CONNECT to this server, which
 * serves the request from registered in-test handlers instead.
 *
 * Only `http://` targets can be answered: CONNECT for `https://` would need a
 * TLS MITM. Tests therefore use `http://*.test` upstreams.
 */
export class UpstreamProxy {
  readonly handlers = new Map<string, UpstreamHandler>()
  readonly calls: UpstreamCall[] = []
  private proxy = createServer()
  private upstream = createServer((req, res) => void this.serve(req, res))

  async start(): Promise<void> {
    this.proxy.on('connect', (_req, socket, head) => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head?.length)
        socket.unshift(head)
      this.upstream.emit('connection', socket)
    })
    this.proxy.listen(0, '127.0.0.1')
    await once(this.proxy, 'listening')
  }

  async stop(): Promise<void> {
    // close() first (stop accepting), then closeAllConnections() so tunneled
    // sockets do not keep the servers open.
    this.upstream.close()
    this.upstream.closeAllConnections()
    this.proxy.close()
    this.proxy.closeAllConnections()
    this.handlers.clear()
    this.calls.length = 0
  }

  /** Environment overrides for `server.restart()` so the child proxies through this stub. */
  childEnv(): Record<string, string> {
    const proxy = `http://127.0.0.1:${(this.proxy.address() as AddressInfo).port}`
    return {
      NODE_USE_ENV_PROXY: '1',
      // Undici prefers the lowercase variable when it exists; both must point
      // at the stub so the empty-string neutralization in childEnv cannot win.
      HTTP_PROXY: proxy,
      http_proxy: proxy,
      HTTPS_PROXY: '',
      https_proxy: '',
      NO_PROXY: '',
      no_proxy: '',
    }
  }

  callsFor(host: string): UpstreamCall[] {
    return this.calls.filter(call => call.host === host)
  }

  private async serve(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    const host = (req.headers.host ?? '').toLowerCase()
    const handler = this.handlers.get(host)
    const method = req.method ?? 'GET'
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    }
    const hasBody = method !== 'GET' && method !== 'HEAD'
    const init: RequestInit & { duplex?: 'half' } = { method, headers }
    if (hasBody) {
      init.body = Readable.toWeb(req) as ReadableStream
      init.duplex = 'half'
    }
    const request = new Request(`http://${host}${req.url ?? '/'}`, init)
    this.calls.push({ host, method, request })

    if (!handler) {
      res.writeHead(502).end('No upstream handler registered')
      return
    }

    try {
      const response = await handler(request)
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
      if (response.body)
        Readable.fromWeb(response.body as unknown as NodeReadableStream).pipe(res)
      else
        res.end()
    }
    catch (error) {
      res.writeHead(500).end(String(error))
    }
  }
}
