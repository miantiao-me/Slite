import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestOrigin } from '../../server/utils/origin'

afterEach(() => vi.unstubAllGlobals())

describe('request origin proxy trust', () => {
  it.each([
    [false, 'http://local.example:5483'],
    [true, 'https://forwarded.example'],
  ])('uses forwarded protocol and host only when trustProxy is %s', (trustProxy, expected) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy }))
    const request = new IncomingMessage(new Socket())
    request.url = '/example'
    request.headers = {
      'host': 'local.example:5483',
      'x-forwarded-host': 'forwarded.example',
      'x-forwarded-proto': 'https',
    }
    const event = createEvent(request, new ServerResponse(request))
    expect(requestOrigin(event)).toBe(expected)
  })
})
