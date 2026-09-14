const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

const BASE64URL_PATTERN = /^[\w-]+$/

export function encodeBase64Url(value: string): string {
  let binary = ''
  for (const byte of textEncoder.encode(value))
    binary += String.fromCharCode(byte)

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function decodeBase64Url(value: string): string {
  if (!BASE64URL_PATTERN.test(value))
    throw new TypeError('Invalid Base64URL value')

  const remainder = value.length % 4
  if (remainder === 1)
    throw new TypeError('Invalid Base64URL value')

  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - remainder) % 4)
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
  return textDecoder.decode(bytes)
}
