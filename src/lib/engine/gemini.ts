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
    const body = await response.text().catch(() => '')
    // Keep the status in the message: KeyPool.isQuotaExceededError matches on it,
    // exactly like the CLI matches on the SDK's "[429 ...]" message format.
    throw new Error(`[${response.status}] ${body.slice(0, 500)}`)
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
