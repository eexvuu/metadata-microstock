/**
 * What the outside world is told about this site.
 *
 * Hardcoded rather than read from `env.ts`, because the root route's `head()`
 * runs on the client too — a `process.env` read there is a build error, and a
 * canonical URL that changes per environment is worse than one that is simply
 * true in production. Staging, if it ever exists, should be noindex anyway.
 *
 * The copy here is deliberately not translated. It is the shelf's description
 * for crawlers and link previews, and the first render is always English.
 */
export const SITE_URL = 'https://tools.eexvuu.eu.org'

export const SITE_NAME = 'Stockflow'

export const SITE_TITLE = 'Stockflow — tools for microstock contributors'

export const SITE_DESCRIPTION =
  'A shelf of free tools for people who upload to microstock. The first writes Adobe Stock and Shutterstock CSV metadata for a whole folder — in your browser, on your own Google API keys, with your media never leaving your machine.'

/** The link-preview card. Its markup, and how to re-shoot it, is deploy/og-card.html. */
export const SITE_OG_IMAGE = `${SITE_URL}/og.jpg`
