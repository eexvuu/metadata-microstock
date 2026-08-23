/**
 * Gemini REST client.
 *
 * The CLI uses @google/generative-ai, which pulls in a Node-shaped SDK. This
 * is the same two fields over plain fetch, so the identical code path runs in
 * a browser tab, in Node and on workerd. The API answers CORS preflight for
 * `x-goog-api-key`, which is what makes the browser-only architecture possible.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface UsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  totalTokenCount?: number
}

/**
 * An API failure with the parts a caller has to branch on.
 *
 * The body is thirty lines of JSON and the two interesting facts are at the
 * bottom of it: which quota was hit, and how long Google wants us to wait.
 * Reading them here is what lets `KeyPool` ask "was that the daily limit?"
 * instead of pattern-matching a truncated string — the per-minute answer and
 * the per-day answer look identical until you reach `quotaId`.
 */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly quotaId?: string,
    readonly retryDelayMs?: number,
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

interface ErrorBody {
  error?: {
    message?: string
    details?: {
      '@type'?: string
      retryDelay?: string
      violations?: { quotaId?: string }[]
    }[]
  }
}

function errorFrom(status: number, body: string): GeminiError {
  let detail = body
  let quotaId: string | undefined
  let retryDelayMs: number | undefined

  try {
    const parsed = JSON.parse(body) as ErrorBody
    if (parsed.error?.message) detail = parsed.error.message
    for (const item of parsed.error?.details ?? []) {
      const type = item['@type'] ?? ''
      if (type.includes('QuotaFailure')) quotaId ??= item.violations?.[0]?.quotaId
      if (type.includes('RetryInfo') && item.retryDelay) {
        const seconds = Number.parseFloat(item.retryDelay)
        if (Number.isFinite(seconds)) retryDelayMs = Math.ceil(seconds * 1000)
      }
    }
  } catch {
    // A body that is not JSON is still worth reporting verbatim.
  }

  // Keep the status in the message: callers match on "[429]" and "[400]"
  // exactly like the CLI matched the SDK's "[429 ...]" format.
  return new GeminiError(`[${status}] ${detail.slice(0, 500)}`, status, quotaId, retryDelayMs)
}

export interface GenerateResult {
  text: string
  usage: UsageMetadata
  durationMs: number
}

/** Chunked so a 30 MB video does not blow the argument limit of String.fromCharCode. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export async function generateContent(options: {
  apiKey: string
  model: string
  prompt: string
  mimeType: string
  base64: string
  signal?: AbortSignal
  /**
   * Structured output. Worth more than any prompt wording: a model told to
   * fill a schema stops writing reasoning around the JSON, which is where all
   * of Gemma's time went. Left off, the request is exactly what it always was.
   */
  responseSchema?: unknown
}): Promise<GenerateResult> {
  const started = Date.now()
  const response = await fetch(`${ENDPOINT}/${options.model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': options.apiKey,
    },
    signal: options.signal,
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: options.prompt },
            { inline_data: { mime_type: options.mimeType, data: options.base64 } },
          ],
        },
      ],
      ...(options.responseSchema
        ? {
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: options.responseSchema,
            },
          }
        : {}),
    }),
  })

  const durationMs = Date.now() - started

  if (!response.ok) {
    throw errorFrom(response.status, await response.text().catch(() => ''))
  }

  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: UsageMetadata
  }

  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')

  if (!text) throw new Error('Empty response from model')

  return { text, usage: json.usageMetadata ?? {}, durationMs }
}
