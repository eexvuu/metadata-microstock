import { outputFilename } from '../media'
import {
  asString,
  extractJsonBlock,
  looksLikeRealMetadata,
  normalizeKeywords,
  stripFences,
  type MetadataObject,
} from '../parse'
import {
  CATEGORY_NAMES,
  DEFAULT_CATEGORY,
  normalizeCategories,
} from '../shutterstock-categories'
import type { MetadataRow, PromptContext, RunOptions } from '../types'
import type { CsvTable, ParseOutcome, PlatformProfile, ResponseSchema } from './types'

const MAX_KEYWORDS = 50

const UNIVERSAL_RULES = `CRITICAL RULES — read carefully:
1. KEYWORD FORMAT: keywords MUST be a single string with values separated by commas ONLY — like "word1, word2, phrase with spaces, word4". NEVER use dashes ("word1- word2-") or spaces alone ("word1 word2 word3") as separators.
2. KEYWORD ORDER: put the most important, most descriptive keywords FIRST — Shutterstock weighs the first keywords most heavily in search.
3. SINGULAR FORM: prefer singular keywords over plural ("flower" not "flowers", "child" not "children", "tree" not "trees"). Exception: words that are inherently plural ("scissors", "glasses", "stairs", "headphones").
4. NO TRADEMARKS OR BRAND NAMES: never include trademarked, branded, or copyrighted terms — Shutterstock rejects them. Avoid brand names ("Nike", "Adidas", "Coca-Cola", "Mercedes-Benz", "Toyota", "Starbucks"), tech/media products ("iPhone", "iPad", "MacBook", "PlayStation", "YouTube", "TikTok", "Instagram"), companies ("Disney", "Pixar", "Marvel", "Microsoft", "Google"), and characters ("Mickey Mouse", "Batman", "Pokemon"). Use generic equivalents: "sports shoe" not "Nike", "soda" not "Coca-Cola", "smartphone" not "iPhone".
5. DESCRIPTION FORMAT: one natural English sentence or phrase describing what is actually visible — NOT a keyword list, NOT a title in Title Case. No quotation marks, no line breaks. Between 20 and 200 characters.`

const CATEGORY_BLOCK = `Category reference — you MUST copy the names EXACTLY as written here (including slashes and capitalisation):
${CATEGORY_NAMES.join(', ')}.
Pick 1 category, or 2 at most, ordered most relevant first. Never invent a category name that is not on this list. Use "Celebrities" only for real identifiable famous people in editorial content.`

/** Gemma occasionally answers with "title" instead of "description". */
function extractDescription(obj: MetadataObject): string {
  for (const field of ['description', 'title', 'caption'] as const) {
    const value = asString(obj[field])
    if (value) return value
  }
  return ''
}

function validate(obj: MetadataObject): MetadataObject | null {
  const description = extractDescription(obj)
  const keywords = asString(obj.keywords)
  return looksLikeRealMetadata(description, keywords) ? obj : null
}

/** No quotes/newlines, max 200 chars cut on a word boundary. */
function normalizeDescription(raw: unknown): string {
  let description = String(raw ?? '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (description.length > 200) {
    const cut = description.slice(0, 200)
    const lastSpace = cut.lastIndexOf(' ')
    description = lastSpace > 120 ? cut.slice(0, lastSpace) : cut
    description = description.replace(/[\s,;:—-]+$/, '')
  }
  return description
}

/**
 * yes/no for the illustration column. An explicit flag wins; vector uploads are
 * illustrations by definition; otherwise the model decides per file.
 */
function resolveIllustration(rawValue: unknown, options: RunOptions): string {
  const forced = options.illustration ?? (options.vectorExtension ? true : null)
  if (forced !== null) return forced ? 'yes' : 'no'
  return /^(yes|true|1|y)$/i.test(String(rawValue ?? '').trim()) ? 'yes' : 'no'
}

function readableName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[[\]]/g, '')
    .replace(/[_-]/g, ' ')
    .trim()
}

/**
 * The prompt's four fields, restated where the decoder can enforce them.
 *
 * `description` being required is also what settles an old quirk: Gemma used
 * to answer with `title` here often enough that `parse` still accepts it.
 */
const RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    description: {
      type: 'STRING',
      description:
        'One clear sentence describing subject, action and setting. Ideal 60-150 characters, max 200.',
    },
    keywords: {
      type: 'STRING',
      description: `Exactly ${MAX_KEYWORDS} keywords separated by commas, ordered by relevance, no brand or trademarked names.`,
    },
    categories: {
      type: 'STRING',
      description:
        'One or two category names from the list in the prompt, comma-separated. Names only, no numbers.',
    },
    illustration: {
      type: 'STRING',
      description: 'Exactly "yes" or "no".',
    },
  },
  required: ['description', 'keywords', 'categories', 'illustration'],
  propertyOrdering: ['description', 'keywords', 'categories', 'illustration'],
}

export const shutterstockProfile: PlatformProfile = {
  id: 'shutterstock',
  label: 'Shutterstock',
  maxKeywords: MAX_KEYWORDS,
  csvPrefix: 'shutterstock',
  // Separate from Adobe's so one folder can be run for both platforms.
  progressFile: '.shutterstock-progress.json',
  // Shutterstock only accepts EPS for vectors, so -vector and -eps are the same.
  vectorExtensions: ['.eps'],
  responseSchema: RESPONSE_SCHEMA,

  buildPrompt({ kind, bracketKeywords }: PromptContext) {
    const hasBrackets = bracketKeywords.length > 0
    const keywordInstruction = hasBrackets
      ? `\n\nCRITICAL REQUIREMENT: The description MUST contain the following keywords: "${bracketKeywords.join(', ')}". Integrate them naturally into the sentence. These keywords must also appear in the keywords list.`
      : ''
    const mustInclude = hasBrackets ? `MUST include: ${bracketKeywords.join(', ')}. ` : ''

    if (kind === 'video') {
      return `Act as a professional stock footage metadata specialist for Shutterstock. Analyze this video and produce metadata optimized for Shutterstock search.${keywordInstruction}

${UNIVERSAL_RULES}

Return STRICT JSON with exactly these four fields:
{
    "description": "string — one clear sentence describing the footage: subject + action + setting/context (max 200 chars, ideal 80-150). ${mustInclude}Example: \\"Confident young businessman walking through a modern glass office corridor in slow motion\\".",
    "keywords": "string — exactly 50 comma-separated keywords ordered by relevance. Mix: 10-12 ACTION (verbs describing movement/activity), 10-12 SUBJECT (people/objects/animals/locations), 8-10 STYLE/SHOT (4k, slow motion, cinematic, aerial, close up, wide shot, time lapse — only if actually applicable), 8-10 MOOD/CONCEPT (inspiring, dramatic, peaceful, energetic, modern), 6-8 USAGE (commercial, advertisement, presentation, social media, background).",
    "categories": "string — 1 or 2 category names from the list below, comma-separated",
    "illustration": "string — yes if the footage is animated / rendered / motion graphics / not filmed with a camera, otherwise no"
}

${CATEGORY_BLOCK}

Return ONLY the JSON object — no markdown fences, no explanation, no extra text.

FINAL INSTRUCTION: Do NOT write any analysis, reasoning, notes, bullet points, or commentary before or after the JSON. Your ENTIRE response must be a single JSON object, starting with "{" and ending with "}".`
    }

    return `Act as a professional stock photography metadata specialist for Shutterstock. Analyze this image and produce metadata optimized for Shutterstock search.${keywordInstruction}

${UNIVERSAL_RULES}

Return STRICT JSON with exactly these four fields:
{
    "description": "string — one clear sentence describing what is visible: main subject + context + notable detail (max 200 chars, ideal 60-150). ${mustInclude}Example: \\"Top view of a minimalist wooden desk with an open notebook coffee cup and green plant in soft morning light\\".",
    "keywords": "string — up to 50 comma-separated keywords ordered by relevance. Mix: 8-12 main subjects/focal points, 8-12 supporting objects/elements/actions, 8-12 abstract ideas/themes/moods/concepts (productivity, wellness, collaboration), 8-12 technical/stylistic descriptors (flat lay, top down view, natural light, minimalist, vibrant color, copy space).",
    "categories": "string — 1 or 2 category names from the list below, comma-separated",
    "illustration": "string — yes if this is a drawing, vector, 3d render, digital art or any non-photographic artwork, otherwise no"
}

${CATEGORY_BLOCK}

Return ONLY the JSON object — no markdown fences, no explanation, no extra text.

FINAL INSTRUCTION: Do NOT write any analysis, reasoning, notes, bullet points, or commentary before or after the JSON. Your ENTIRE response must be a single JSON object, starting with "{" and ending with "}".`
  },

  retryInstruction:
    'CRITICAL FORMAT REQUIREMENT: Your previous response had malformed keywords. The "keywords" field MUST be a single string with values separated by commas only — exactly like "word1, word2, word3, phrase with spaces, another phrase". NEVER use dashes as separators ("word1- word2-"). NEVER use spaces alone as separators ("word1 word2 word3"). Multi-word phrases like "natural light" are allowed as a single keyword. Return ONLY the JSON object.',

  parse(text, ctx, options): ParseOutcome {
    const cleaned = stripFences(text)

    let metadata: MetadataObject | null = null
    let extracted = false
    try {
      metadata = validate(JSON.parse(cleaned) as MetadataObject)
    } catch {
      metadata = null
    }
    if (!metadata) {
      metadata = extractJsonBlock(cleaned, validate)
      extracted = metadata !== null
    }
    if (!metadata) {
      return {
        row: shutterstockProfile.parseFailureFallback(ctx, options),
        irreparable: false,
        extracted: false,
        parseFailed: true,
        adjustedForBrackets: [],
      }
    }

    let description = extractDescription(metadata) || 'Untitled'

    const lower = description.toLowerCase()
    const missing = ctx.bracketKeywords.filter((kw) => !lower.includes(kw.toLowerCase()))
    if (missing.length > 0) {
      description = `${missing.join(' ')} - ${description}`
    }
    description = normalizeDescription(description)

    const normalized = normalizeKeywords(metadata.keywords, MAX_KEYWORDS)

    // Bracket keywords must survive in the keyword list too, at the front where
    // Shutterstock weighs them most.
    let keywords = normalized.keywords
    if (ctx.bracketKeywords.length > 0 && keywords) {
      const existing = new Set(keywords.split(',').map((kw) => kw.trim().toLowerCase()))
      const missingKeywords = ctx.bracketKeywords.filter(
        (kw) => !existing.has(kw.toLowerCase()),
      )
      if (missingKeywords.length > 0) {
        keywords = [...missingKeywords, ...keywords.split(',').map((kw) => kw.trim())]
          .slice(0, MAX_KEYWORDS)
          .join(', ')
      }
    }

    return {
      row: {
        filename: outputFilename(ctx.name, options.vectorExtension),
        sourceName: ctx.name,
        title: '',
        description,
        keywords,
        category: normalizeCategories(metadata.categories ?? metadata.category).join(','),
        illustration: resolveIllustration(metadata.illustration, options),
        processedAt: new Date().toISOString(),
      },
      irreparable: normalized.irreparable,
      extracted,
      parseFailed: false,
      adjustedForBrackets: missing,
    }
  },

  parseFailureFallback(ctx, options): MetadataRow {
    const name = readableName(ctx.name)
    const isVideo = ctx.kind === 'video'

    return {
      filename: outputFilename(ctx.name, options.vectorExtension),
      sourceName: ctx.name,
      title: '',
      description: normalizeDescription(
        isVideo
          ? `Professional stock video footage of ${name} for commercial and creative projects`
          : `Professional stock image of ${name} for commercial and creative projects`,
      ),
      keywords: isVideo
        ? 'stock video, footage, professional, commercial, cinematic, hd, 4k, business, media content, video production, digital asset, marketing, promotional, motion, visual content, multimedia, broadcast, royalty free, video clip, background'
        : 'stock photo, image, professional, commercial, high quality, background, concept, design, creative, modern, visual content, marketing, promotional, digital, copy space',
      category: DEFAULT_CATEGORY,
      illustration: resolveIllustration('no', options),
      processedAt: new Date().toISOString(),
      fallback: 'parse',
    }
  },

  errorFallback(ctx, _message, options): MetadataRow {
    return { ...shutterstockProfile.parseFailureFallback(ctx, options), fallback: 'error' }
  },

  toCsv(rows, options): CsvTable {
    return {
      headers: [
        'Filename',
        'Description',
        'Keywords',
        'Categories',
        'Editorial',
        'Mature content',
        'illustration',
      ],
      rows: rows.map((row) => [
        row.filename,
        row.description ?? '',
        row.keywords,
        row.category || DEFAULT_CATEGORY,
        options.editorial ? 'yes' : 'no',
        options.mature ? 'yes' : 'no',
        row.illustration ?? 'no',
      ]),
      // Shutterstock's own template ships without a BOM and its parser reads
      // the header literally — a BOM breaks the first column.
      bom: false,
    }
  },
}
