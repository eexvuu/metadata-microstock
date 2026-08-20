/**
 * Gemma's chain-of-thought is the reason this file exists. The model writes
 * paragraphs of reasoning before (and after) its JSON no matter how firmly the
 * prompt forbids it, and the reasoning itself contains brace blocks — schema
 * echoes like {"title": "string — ..."} and placeholders like {"title": "..."}.
 * Ported from gemma/index.js `_extractJsonBlock` / `_tryParseCandidate`.
 */

export type MetadataObject = Record<string, unknown>

/** Decides whether a parsed brace block is real metadata or reasoning noise. */
export type CandidateValidator = (obj: MetadataObject) => MetadataObject | null

export function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

/** Shared rejection rules for schema echoes and placeholder values. */
export function looksLikeRealMetadata(headline: string, keywords: string): boolean {
  if (!headline || !keywords) return false
  // Values copied straight out of the prompt template start with "string"
  if (/^string\b/i.test(headline) || /^string\b/i.test(keywords)) return false
  if (headline.replace(/[.\s]/g, '').length < 5) return false
  if (!keywords.includes(',')) return false
  return true
}

function parseCandidate(candidate: string, validate: CandidateValidator): MetadataObject | null {
  let obj: unknown
  try {
    obj = JSON.parse(candidate)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  return validate(obj as MetadataObject)
}

export function extractJsonBlock(
  text: string,
  validate: CandidateValidator,
): MetadataObject | null {
  // Candidate 1: first "{" to last "}" — one JSON object wrapped in prose,
  // nested braces included. This is the common case.
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const obj = parseCandidate(text.slice(first, last + 1), validate)
    if (obj) return obj
  }

  // Candidate 2: every flat {...} block in order — the first one that passes
  // validation wins, which skips the schema echoes in the reasoning.
  for (const block of text.match(/\{[\s\S]*?\}/g) ?? []) {
    const obj = parseCandidate(block, validate)
    if (obj) return obj
  }
  return null
}

export function stripFences(text: string): string {
  return text.replace(/```json/g, '').replace(/```/g, '').trim()
}

export interface NormalizedKeywords {
  keywords: string
  wasFixed: boolean
  /** No reliable separator was found — the caller should retry the request. */
  irreparable: boolean
}

/**
 * Gemini occasionally returns dash-separated ("word- word- word") or space-only
 * ("word word word") keywords instead of commas. Rescue what can be rescued and
 * tell the caller when the rescue was a guess.
 */
export function normalizeKeywords(raw: unknown, maxKeywords: number): NormalizedKeywords {
  let text = ''
  if (Array.isArray(raw)) {
    text = raw
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(', ')
  } else if (typeof raw === 'string') {
    text = raw.trim()
  }

  if (!text) return { keywords: '', wasFixed: false, irreparable: true }

  const commaCount = (text.match(/,/g) ?? []).length
  const dashCount = (text.match(/-/g) ?? []).length

  let tokens: string[]
  let wasFixed = false
  let irreparable = false

  if (commaCount >= 5) {
    tokens = text.split(',')
  } else if (dashCount >= 10 && commaCount < 5) {
    tokens = text.split('-')
    wasFixed = true
  } else {
    tokens = text.split(/\s+/)
    wasFixed = true
    irreparable = true
  }

  tokens = tokens
    .map((token) => token.trim().replace(/^[-,]+|[-,]+$/g, '').trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const deduped: string[] = []
  for (const token of tokens) {
    const key = token.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(token)
    }
  }

  return {
    keywords: deduped.slice(0, maxKeywords).join(', '),
    wasFixed,
    irreparable,
  }
}
