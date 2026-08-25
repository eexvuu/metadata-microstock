import { GeminiError } from './gemini'

/**
 * The Files API: media by reference instead of media in the request body.
 *
 * Two things this buys, both measured on a 68 MB 4K ProRes .mov, 2026-08-25:
 * Google decodes codecs the browser cannot (the model described that clip
 * correctly on both rungs, at the same 462 video tokens an inline H.264
 * costs), and it lifts the ~20 MB ceiling on a `generateContent` body that a
 * genuinely big finished file still runs into.
 *
 * It is reachable from a tab, which is the part that was never checked before.
 * Preflight answers 200 with our origin, `X-Goog-Upload-URL` is listed in
 * `Access-Control-Expose-Headers` — without that the resumable handshake is
 * unreadable from JavaScript and none of this works — and DELETE is allowed
 * too, so a run cleans up after itself rather than leaving somebody's footage
 * on Google's servers for the 48 hours it would otherwise sit there.
 *
 * A file belongs to the project behind the key that uploaded it, so an upload
 * never outlives the key it was made for: rotate keys and the next one has to
 * upload again. That is why this is called from inside `generateWithKey`.
 */

const BASE = 'https://generativelanguage.googleapis.com'
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 180000

export interface UploadedMedia {
  /** What `file_data.file_uri` wants. */
  uri: string
  /** `files/xyz` — what DELETE and the state poll want. */
  name: string
  mimeType: string
}

interface FileResource {
  name?: string
  uri?: string
  mimeType?: string
  state?: 'PROCESSING' | 'ACTIVE' | 'FAILED'
  error?: { message?: string }
}

async function fail(response: Response, what: string): Promise<never> {
  const body = await response.text().catch(() => '')
  throw new GeminiError(`[${response.status}] ${what}: ${body.slice(0, 300)}`, response.status)
}

export async function uploadMedia(options: {
  apiKey: string
  bytes: Uint8Array
  mimeType: string
  displayName: string
  signal?: AbortSignal
}): Promise<UploadedMedia> {
  const { apiKey, bytes, mimeType, displayName, signal } = options

  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  })
  if (!start.ok) await fail(start, 'upload could not start')

  const uploadUrl = start.headers.get('x-goog-upload-url')
  if (!uploadUrl) {
    throw new Error(
      'The upload session URL came back unreadable — a browser needs X-Goog-Upload-URL exposed by CORS.',
    )
  }

  const sent = await fetch(uploadUrl, {
    method: 'POST',
    signal,
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
    },
    // The view itself, not a copy of it: a 200 MB file is quite enough to be
    // holding once.
    body: bytes as BodyInit,
  })
  if (!sent.ok) await fail(sent, 'upload failed')

  let file = ((await sent.json()) as { file?: FileResource }).file ?? {}

  // Google transcodes video before a model may read it. Small clips are ACTIVE
  // on arrival; a 4K master takes a few seconds.
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (file.state === 'PROCESSING' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    if (signal?.aborted) throw new Error('aborted')
    const poll = await fetch(`${BASE}/v1beta/${file.name}`, {
      signal,
      headers: { 'x-goog-api-key': apiKey },
    })
    if (!poll.ok) await fail(poll, 'upload state could not be read')
    file = (await poll.json()) as FileResource
  }

  if (file.state !== 'ACTIVE' || !file.uri || !file.name) {
    throw new Error(
      `The upload never became readable (${file.state ?? 'unknown'})${file.error?.message ? `: ${file.error.message}` : ''}`,
    )
  }

  return { uri: file.uri, name: file.name, mimeType: file.mimeType ?? mimeType }
}

/**
 * Best effort by design: an upload that outlives its run expires on Google's
 * side within about two days, so a failed delete is not worth failing a
 * finished file over.
 */
export async function deleteMedia(apiKey: string, name: string): Promise<void> {
  await fetch(`${BASE}/v1beta/${name}`, {
    method: 'DELETE',
    headers: { 'x-goog-api-key': apiKey },
  }).catch(() => undefined)
}
