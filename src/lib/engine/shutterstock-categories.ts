/**
 * Shutterstock's contributor category list, aliases and fuzzy lookup —
 * ported verbatim from gemma/shutterstock.js. The alias table exists because
 * Gemma answers with its own wording; without it most rows would fall back to
 * Miscellaneous.
 */

/** Shutterstock's contributor category list (name → internal id). */
export const SHUTTERSTOCK_CATEGORIES: [string, number][] = [
  ["Abstract", 26],
  ["Animals/Wildlife", 1],
  ["Arts", 11],
  ["Backgrounds/Textures", 3],
  ["Beauty/Fashion", 27],
  ["Buildings/Landmarks", 2],
  ["Business/Finance", 4],
  ["Celebrities", 31],
  ["Education", 5],
  ["Food and drink", 6],
  ["Healthcare/Medical", 7],
  ["Holidays", 8],
  ["Industrial", 10],
  ["Interiors", 21],
  ["Miscellaneous", 22],
  ["Nature", 12],
  ["Objects", 9],
  ["Parks/Outdoor", 25],
  ["People", 13],
  ["Religion", 14],
  ["Science", 15],
  ["Signs/Symbols", 17],
  ["Sports/Recreation", 18],
  ["Technology", 16],
  ["Transportation", 0],
  ["Vintage", 24],
];

/**
 * Extra spellings Gemma tends to return, mapped to the canonical category.
 * The canonical name itself and each of its "/"-separated parts are registered
 * automatically, so only genuinely different wordings belong here.
 */
const CATEGORY_ALIASES: Record<string, string[]> = {
  Abstract: ["abstraction", "geometric", "conceptual art"],
  "Animals/Wildlife": ["animal", "wildlife", "pet", "pets", "bird", "insect"],
  Arts: ["art", "artwork", "painting", "craft", "handicraft"],
  "Backgrounds/Textures": [
    "background",
    "texture",
    "pattern",
    "patterns",
    "wallpaper",
    "surface",
  ],
  "Beauty/Fashion": ["beauty", "fashion", "makeup", "cosmetic", "style"],
  "Buildings/Landmarks": [
    "building",
    "landmark",
    "architecture",
    "architectural",
    "city",
    "cityscape",
    "urban",
    "construction",
  ],
  "Business/Finance": [
    "business",
    "finance",
    "financial",
    "office",
    "corporate",
    "money",
    "marketing",
    "economy",
  ],
  Celebrities: ["celebrity", "famous person", "public figure"],
  Education: ["school", "learning", "study", "student", "classroom"],
  "Food and drink": [
    "food",
    "drink",
    "drinks",
    "food and drinks",
    "beverage",
    "beverages",
    "cooking",
    "culinary",
    "restaurant",
  ],
  "Healthcare/Medical": [
    "health",
    "healthcare",
    "medical",
    "medicine",
    "hospital",
    "doctor",
    "wellness",
  ],
  Holidays: ["holiday", "christmas", "celebration", "festive", "new year"],
  Industrial: ["industry", "manufacturing", "factory", "machinery", "worker"],
  Interiors: ["interior", "indoor", "room", "furniture", "home interior"],
  Miscellaneous: ["misc", "other", "general", "various"],
  Nature: [
    "natural",
    "landscape",
    "landscapes",
    "environment",
    "flower",
    "flowers",
    "plant",
    "plants",
    "tree",
    "sky",
    "water",
    "weather",
  ],
  Objects: ["object", "product", "still life", "item", "tool"],
  "Parks/Outdoor": [
    "park",
    "parks",
    "outdoor",
    "outdoors",
    "garden",
    "camping",
    "hiking",
  ],
  People: [
    "person",
    "human",
    "man",
    "woman",
    "child",
    "family",
    "lifestyle",
    "portrait",
    "crowd",
  ],
  Religion: ["religious", "spiritual", "faith", "worship", "islamic", "church"],
  Science: ["scientific", "research", "laboratory", "chemistry", "biology"],
  "Signs/Symbols": [
    "sign",
    "signs",
    "symbol",
    "symbols",
    "icon",
    "icons",
    "logo",
    "typography",
    "text",
  ],
  "Sports/Recreation": [
    "sport",
    "sports",
    "recreation",
    "fitness",
    "exercise",
    "game",
    "gaming",
    "leisure",
  ],
  Technology: [
    "tech",
    "technological",
    "computer",
    "digital",
    "internet",
    "ai",
    "artificial intelligence",
    "software",
  ],
  Transportation: [
    "transport",
    "vehicle",
    "vehicles",
    "car",
    "traffic",
    "travel",
    "logistics",
    "aviation",
  ],
  Vintage: ["retro", "antique", "old fashioned", "nostalgia", "classic"],
};


export const DEFAULT_CATEGORY = 'Miscellaneous'

/**
 * Extensions Shutterstock's bulk uploader accepts. Anything else (notably .png,
 * .webp, .svg, .ai) is rejected at upload time with "This original filename is
 * invalid."
 */
export const SHUTTERSTOCK_EXTENSIONS = new Set(['.jpg', '.jpeg', '.eps', '.mov', '.mp4'])

/** Characters Shutterstock refuses inside a filename. */
export const INVALID_FILENAME_CHARS = /[\n\r\t/\\]/

/** Lowercase, strip punctuation, collapse whitespace — for fuzzy matching. */
export function slugify(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** slug → canonical category name, built once at module load. */
export const CATEGORY_LOOKUP: Map<string, string> = (() => {
  const lookup = new Map<string, string>()
  const add = (key: string, name: string) => {
    const slug = slugify(key)
    // First writer wins: canonical names and their parts are registered before
    // aliases, so an alias can never shadow a real category name.
    if (slug && !lookup.has(slug)) lookup.set(slug, name)
  }

  for (const [name] of SHUTTERSTOCK_CATEGORIES) add(name, name)
  for (const [name] of SHUTTERSTOCK_CATEGORIES) {
    for (const part of name.split('/')) add(part, name)
  }
  for (const [name, aliases] of Object.entries(CATEGORY_ALIASES)) {
    for (const alias of aliases) add(alias, name)
  }
  return lookup
})()

/** numeric id (as string) → canonical category name. */
export const CATEGORY_BY_ID = new Map(
  SHUTTERSTOCK_CATEGORIES.map(([name, id]) => [String(id), name] as const),
)

export const CATEGORY_NAMES = SHUTTERSTOCK_CATEGORIES.map(([name]) => name)

/**
 * Map whatever the model returned into 1-2 canonical category names. Accepts
 * names, ids, aliases and messy casing; falls back to Miscellaneous so a row is
 * never rejected for an empty category.
 */
export function normalizeCategories(raw: unknown): string[] {
  let tokens: string[] = []
  if (Array.isArray(raw)) {
    tokens = raw.flatMap((item) => String(item).split(','))
  } else if (typeof raw === 'string' || typeof raw === 'number') {
    tokens = String(raw).split(',')
  }

  const resolved: string[] = []
  for (const token of tokens) {
    const trimmed = token.trim().replace(/^["']+|["']+$/g, '')
    if (!trimmed) continue

    const slug = slugify(trimmed)
    let name =
      CATEGORY_LOOKUP.get(slug) ||
      (/^\d+$/.test(trimmed) ? CATEGORY_BY_ID.get(trimmed) : undefined)

    // Last resort: the model wrapped a known category in extra words
    // ("nature and landscape") — match on the longest contained alias.
    if (!name) {
      let bestLength = 0
      for (const [aliasSlug, aliasName] of CATEGORY_LOOKUP) {
        if (
          aliasSlug.length > bestLength &&
          (slug === aliasSlug ||
            slug.startsWith(`${aliasSlug} `) ||
            slug.endsWith(` ${aliasSlug}`) ||
            slug.includes(` ${aliasSlug} `))
        ) {
          name = aliasName
          bestLength = aliasSlug.length
        }
      }
    }

    if (name && !resolved.includes(name)) resolved.push(name)
    if (resolved.length === 2) break
  }

  return resolved.length > 0 ? resolved : [DEFAULT_CATEGORY]
}
