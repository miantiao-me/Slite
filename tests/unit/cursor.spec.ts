import { describe, expect, it } from 'vitest'
import { decodeBase64Url, encodeBase64Url } from '../../shared/utils/cursor'

describe('base64url cursor values', () => {
  it.each([
    ['ASCII', 'plain-ascii'],
    ['Chinese', '中文标签'],
    ['emoji', '🚀-发布'],
    ['long payload', 'a'.repeat(2048)],
  ])('round-trips %s text', (_name, value) => {
    const encoded = encodeBase64Url(value)

    expect(encoded).toMatch(/^[\w-]+$/)
    expect(decodeBase64Url(encoded)).toBe(value)
  })

  it.each([
    '',
    'a',
    'not+base64',
    'has/slash',
    'trailing=',
    '中文',
  ])('rejects malformed value: %s', (value) => {
    expect(() => decodeBase64Url(value)).toThrow(TypeError)
  })

  it('rejects bytes that are not valid UTF-8', () => {
    expect(() => decodeBase64Url('_w')).toThrow()
  })
})
