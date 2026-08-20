import { outputFilename } from '../media'
import {
  asString,
  extractJsonBlock,
  looksLikeRealMetadata,
  normalizeKeywords,
  stripFences,
  type MetadataObject,
} from '../parse'
import type { MetadataRow, PromptContext } from '../types'
import type { CsvTable, ParseOutcome, PlatformProfile } from './types'

const MAX_KEYWORDS = 49

const CATEGORY_REFERENCE =
  '1=Animals, 2=Buildings and Architecture, 3=Business, 4=Drinks, 5=The Environment, 6=States of Mind, 7=Food, 8=Graphic Resources, 9=Hobbies and Leisure, 10=Industry, 11=Landscapes, 12=Lifestyle, 13=People, 14=Plants and Flowers, 15=Culture and Religion, 16=Science, 17=Social Issues, 18=Sports, 19=Technology, 20=Transport, 21=Travel'

const UNIVERSAL_RULES = `CRITICAL RULES — read carefully:
1. KEYWORD FORMAT: keywords MUST be a single string with values separated by commas ONLY — like "word1, word2, phrase with spaces, word4". NEVER use dashes ("word1- word2-") or spaces alone ("word1 word2 word3") as separators.
2. SINGULAR FORM: prefer singular keywords over plural ("flower" not "flowers", "child" not "children", "tree" not "trees", "hand" not "hands"). Adobe Stock's keyword search consolidates better on singular forms. Exception: words that are inherently plural ("scissors", "glasses", "stairs", "headphones").
3. NO TRADEMARKS OR BRAND NAMES: never include trademarked, branded, or copyrighted terms. Adobe Stock automatically rejects them. Avoid: brand names ("Nike", "Adidas", "Coca-Cola", "Pepsi", "Mercedes-Benz", "BMW", "Ford", "Toyota", "Tesla", "Starbucks", "McDonald's"), tech/media products ("iPhone", "iPad", "MacBook", "PlayStation", "Xbox", "YouTube", "TikTok", "Instagram", "Facebook"), companies ("Disney", "Pixar", "Marvel", "Microsoft", "Google", "Amazon"), characters ("Mickey Mouse", "Batman", "Pokemon", "Harry Potter"). Use generic equivalents: "sports shoe" not "Nike", "soda" not "Coca-Cola", "smartphone" not "iPhone", "social media app" not "Instagram", "luxury car" not "Mercedes-Benz".
4. TITLE FORMAT: no commas, no quotation marks (use hyphens, colons, pipes, or ampersands instead).`

function validate(obj: MetadataObject): MetadataObject | null {
  const title = asString(obj.title)
  const keywords = asString(obj.keywords)
  return looksLikeRealMetadata(title, keywords) ? obj : null
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function readableName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
}

export const adobeProfile: PlatformProfile = {
  id: 'adobe',
  label: 'Adobe Stock',
  maxKeywords: MAX_KEYWORDS,
  csvPrefix: 'metadata',
  progressFile: '.metadata-progress.json',
  vectorExtensions: ['.ai', '.eps'],

  buildPrompt({ kind, bracketKeywords }: PromptContext) {
    const hasBrackets = bracketKeywords.length > 0
    const keywordInstruction = hasBrackets
      ? `\n\nCRITICAL REQUIREMENT: The title MUST contain the following keywords: "${bracketKeywords.join(', ')}". Integrate them naturally into the title. These keywords must also appear in the keywords list.`
      : ''
    const mustInclude = hasBrackets ? `MUST include: ${bracketKeywords.join(', ')}. ` : ''

    if (kind === 'video') {
      return `Act as a professional video SEO expert and stock footage specialist. Analyze this video and create highly optimized metadata designed to maximize discoverability on stock video platforms and search engines.${keywordInstruction}

${UNIVERSAL_RULES}

Return STRICT JSON with exactly these three fields:
{
    "title": "string — engaging SEO-optimized title (max 200 chars, ideal 60-100). Include: action verb + primary subject + emotional/descriptive adjective + context. ${mustInclude}Examples: \\"Confident Businessman Walking Through Modern Office Corridor\\", \\"Dramatic Ocean Waves Crashing Against Rocky Coastline at Sunset\\", \\"Happy Family Cooking Together in Bright Kitchen\\".",
    "keywords": "string — exactly 49 comma-separated keywords. Mix: 10-12 ACTION (verbs describing movement/activity), 10-12 SUBJECT (people/objects/animals/locations), 8-10 STYLE/QUALITY (4K, HD, slow motion, cinematic, aerial, close-up, wide shot, time-lapse — only include if actually applicable), 8-10 MOOD/CONCEPT (inspiring, dramatic, peaceful, energetic, lifestyle, modern), 6-8 USAGE (commercial, advertisement, presentation, social media, documentary, stock footage).",
    "category": "string — single number 1-21 (no other text)"
}

Category reference: ${CATEGORY_REFERENCE}.

Return ONLY the JSON object — no markdown fences, no explanation, no extra text.

FINAL INSTRUCTION: Do NOT write any analysis, reasoning, notes, bullet points, or commentary before or after the JSON. Your ENTIRE response must be a single JSON object, starting with "{" and ending with "}".`
    }

    return `Act as a professional SEO and stock photography metadata expert. Analyze the image and generate highly optimized metadata to maximize visibility and searchability.${keywordInstruction}

${UNIVERSAL_RULES}

Return STRICT JSON with exactly these three fields:
{
    "title": "string — SEO-optimized title (ideal 60-80 chars, max 200). Concise, descriptive, contains the primary subject. Functions well as image alt-text. ${mustInclude}",
    "keywords": "string — up to 49 comma-separated keywords. Mix: 8-12 main subjects/focal points, 8-12 supporting objects/elements/actions, 8-12 abstract ideas/themes/moods/concepts (e.g., productivity, wellness, collaboration), 8-12 technical/stylistic descriptors (e.g., flat lay, top-down view, natural light, minimalist, vibrant colors).",
    "category": "string — single number 1-21 (no other text)"
}

Category reference: ${CATEGORY_REFERENCE}.

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
        row: adobeProfile.parseFailureFallback(ctx, options),
        irreparable: false,
        extracted: false,
        parseFailed: true,
        adjustedForBrackets: [],
      }
    }

    let title = asString(metadata.title) || 'Untitled'

    const lower = title.toLowerCase()
    const missing = ctx.bracketKeywords.filter((kw) => !lower.includes(kw.toLowerCase()))
    if (missing.length > 0) {
      title = `${missing.map(titleCase).join(' ')} - ${title}`
    }

    title = title
      .replace(/"/g, '')
      .replace(/,/g, ' -')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200)

    const normalized = normalizeKeywords(metadata.keywords, MAX_KEYWORDS)

    return {
      row: {
        filename: outputFilename(ctx.name, options.vectorExtension),
        sourceName: ctx.name,
        title,
        keywords: normalized.keywords,
        category: asString(metadata.category) || '1',
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
    const base = {
      filename: outputFilename(ctx.name, options.vectorExtension),
      sourceName: ctx.name,
      processedAt: new Date().toISOString(),
      fallback: 'parse' as const,
    }

    if (ctx.kind === 'video') {
      return {
        ...base,
        title: `Professional Stock Video: ${titleCase(name)}`,
        keywords:
          'stock video, professional footage, commercial use, HD quality, cinematic, business, corporate, media content, video production, digital asset, marketing material, promotional video, high definition, premium stock, video clip, motion graphics, visual content, multimedia, broadcast quality, royalty free, professional video',
        category: '8',
      }
    }
    return {
      ...base,
      title: `Image: ${titleCase(name)}`,
      keywords: 'image, photo, stock photography, professional, high quality, commercial use',
      category: '1',
    }
  },

  errorFallback(ctx, message, options): MetadataRow {
    const name = readableName(ctx.name)
    const base = {
      filename: outputFilename(ctx.name, options.vectorExtension),
      sourceName: ctx.name,
      processedAt: new Date().toISOString(),
      fallback: 'error' as const,
    }

    if (ctx.kind === 'video') {
      return {
        ...base,
        title: `Stock Video Content: ${titleCase(name)}`,
        keywords:
          'stock video, media content, video footage, professional, commercial, digital media, video production, multimedia, broadcast, HD video, cinematic, business video, corporate footage, promotional content, visual media, motion picture, video clip, media asset, production ready, commercial license',
        category: '8',
      }
    }
    return {
      ...base,
      title: `Error: ${ctx.name}`,
      keywords: 'error',
      category: '1',
      description: `Request failed: ${message}`,
    }
  },

  toCsv(rows): CsvTable {
    return {
      headers: ['Filename', 'Title', 'Keywords', 'Category'],
      rows: rows.map((row) => [row.filename, row.title, row.keywords, row.category]),
      // Adobe Stock's importer needs the UTF-8 BOM.
      bom: true,
    }
  },
}
