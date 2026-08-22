import { env } from '#/lib/runtime/env'

/**
 * AES-256-GCM for the Gemini keys we hold on a user's behalf.
 *
 * These are third-party credentials with real money behind them, so they never
 * sit in D1 in the clear. The key is derived from `ENCRYPTION_SECRET`, which is
 * a Worker secret in production — rotating it makes every stored ciphertext
 * undecryptable, which is a user-visible event, not a silent one.
 *
 * workerd ships full WebCrypto, so there is no dependency here.
 */

const IV_BYTES = 12

let cachedKey: Promise<CryptoKey> | null = null

function encryptionKey(): Promise<CryptoKey> {
  cachedKey ??= (async () => {
    const secret = env.ENCRYPTION_SECRET
    if (!secret) {
      throw new Error(
        'ENCRYPTION_SECRET is not set — add it to .dev.vars, or `wrangler secret put ENCRYPTION_SECRET` in production.',
      )
    }
    // SHA-256 of the secret gives the exact 32 bytes AES-256 wants, whatever
    // length the operator's secret happens to be.
    const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
    return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ])
  })()
  return cachedKey
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Returns "<iv>:<ciphertext>", both base64. A fresh IV per call, never reused. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(plaintext),
  )
  return `${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
}

export async function decryptSecret(stored: string): Promise<string> {
  const [iv, ciphertext] = stored.split(':')
  if (!iv || !ciphertext) throw new Error('Stored value is not in <iv>:<ciphertext> form')

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    await encryptionKey(),
    fromBase64(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

/**
 * The only representation of a key that is safe to render or log:
 * "AIzaSy…8Qk2". Enough to tell two keys apart, useless to anyone else.
 */
export function previewOf(key: string): string {
  if (key.length <= 10) return `${key.slice(0, 2)}…`
  return `${key.slice(0, 6)}…${key.slice(-4)}`
}
