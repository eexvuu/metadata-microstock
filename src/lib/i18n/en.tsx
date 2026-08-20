import type { ReactNode } from 'react'

/**
 * The English copy, and the shape every other locale has to match.
 *
 * `Messages` is `typeof en`, so a missing or misspelled key in a translation
 * is a typecheck failure rather than a blank spot on the page. Entries that
 * carry markup or a number are functions or elements — word order differs
 * between languages, and a sentence spliced together from fragments does not
 * survive translation.
 *
 * What is deliberately NOT here: anything the generator writes. Titles,
 * keywords and the CSV are output for a stock platform, and stock platforms
 * want English.
 */
export const en = {
  nav: {
    overview: 'Overview',
    tools: 'Tools',
    history: 'History',
    catalog: 'Catalog',
    metadata: 'Metadata',
    monitoring: 'Monitoring',
  },

  header: {
    signIn: 'Sign in',
    start: 'Start',
    accountMenu: 'Account menu',
    signOut: 'Sign out',
    language: 'Language',
    theme: 'Theme',
    themeModes: { light: 'light', dark: 'dark', auto: 'auto' },
  },

  footer: {
    blurb: (
      <>
        Tools for the people who upload to microstock. Your media stays on your
        machine; the model runs on{' '}
        <span className="text-primary font-mono">your own keys</span>.
      </>
    ) as ReactNode,
    stamp: 'Gemma · your keys · your machine',
  },

  landing: {
    eyebrow: 'Stockflow · first tool, free forever',
    headline: (
      <>
        Stock metadata for the{' '}
        <em className="text-primary font-normal italic">whole folder</em>, in one
        run.
      </>
    ) as ReactNode,
    lead: "Stockflow is a shelf of tools for people who upload to microstock. The first one writes titles, 49 keywords and the right category for every image and video in a folder, straight into the CSV Adobe Stock and Shutterstock ask for — on Google's free Gemma model and your own API keys.",
    ctaPrimary: 'Create a free account',
    ctaSecondary: 'Sign in',
    stats: [
      'keywords per file',
      'free requests per key',
      'bytes of media uploaded',
    ],
    sheetStatus: 'developing',
    sheetFooter: '6 / 6 files · 291 keywords',

    catalogTitle: 'On the shelf',
    catalogLead:
      'One account, one set of keys, and a tool for each job. Everything a tool knows about your media stays in the tab it runs in.',
    catalogFree: 'free',
    catalogPlanned: 'planned',
    catalogMetadata:
      "A folder of images and videos in, an Adobe Stock or Shutterstock CSV out. Resumable, multi-key, and free for as long as Google's free tier exists.",
    catalogMetadataCta: 'Start with this one',
    catalogNextTitle: 'The next tool',
    catalogNext:
      'More of the upload routine belongs here. Whatever lands next shares the same account, the same keys and the same rule: your files never reach our server.',

    processTitle: 'How it works',
    steps: [
      {
        title: 'Create an account',
        body: 'Free, no card, and nothing to configure before the first run.',
      },
      {
        title: 'Add your Gemini keys',
        body: 'Pasted once, verified against Google, then encrypted on your account.',
      },
      {
        title: 'Drag your photos in',
        body: 'Check the titles and keywords it wrote, fix anything you like, then take the CSV.',
      },
    ],

    specimenTitle: 'What lands in the folder',
    specimenLead:
      'One CSV, byte-for-byte the shape each platform accepts — the BOM, the quoting, the line endings. Drop it into the upload queue without opening a spreadsheet.',

    featuresTitle: 'What you get',
    features: [
      {
        title: 'A whole folder at once',
        body: 'Drag in a folder of images and videos. Every file is analysed and the CSV lands back next to your media, ready to upload.',
      },
      {
        title: 'Adobe and Shutterstock',
        body: 'Each platform gets its own prompt, its own keyword limit and its exact CSV shape — BOM where Adobe wants one, category names where Shutterstock wants those.',
      },
      {
        title: 'Your keys, your quota',
        body: 'Bring your own free Gemini keys. Each one adds about 15 requests a minute, and the run spreads work across all of them.',
      },
      {
        title: 'You get the last word',
        body: 'Nothing is written until you say so: every title, keyword and category is editable next to the picture it came from, and only then does the CSV get made.',
      },
      {
        title: 'Media never leaves your machine',
        body: 'The analysis runs in your browser and talks to Google directly. Your photos and footage are never uploaded to us — we do not even have somewhere to put them.',
      },
      {
        title: 'Vector uploads, without the fuss',
        body: 'Upload the JPEG or SVG you exported, then set the filename the CSV should carry — .eps, .ai, anything — for one row or for all of them at once.',
      },
    ],

    closeHeadline: (
      <>
        Stop writing keywords{' '}
        <em className="text-primary font-normal italic">by hand</em>.
      </>
    ) as ReactNode,
    closeLead:
      'Add your keys once and every upload batch after that is one click and a coffee.',
    closeCta: 'Get started',
  },

  catalog: {
    index: 'Catalog',
    title: 'Your tools',
    lead: 'Everything here runs on your own Gemini keys, in your own browser. The metadata tool is free and always will be — anything paid will say so on its card.',
    free: 'free',
    planned: 'planned',
    metadataBody:
      'Titles, 49 keywords and the right category for a whole folder of images and videos, written into the CSV Adobe Stock and Shutterstock ask for.',
    statRuns: 'runs',
    statFiles: 'files',
    statKeys: 'keys',
    open: 'Open tool',
    needKey: 'add a free Gemini key inside the tool',
    nextTitle: 'The next tool',
    nextBody: (
      <>
        This shelf is built to hold more than one thing. A new tool is a folder
        under <code className="font-mono text-xs">src/lib/</code> and a card
        here — the account, the keys and the run history are already shared.
      </>
    ) as ReactNode,
    lastRun: 'Last run',
    fullHistory: 'Full history',
    files: (done: number, total: number) => `${done}/${total} files`,
  },

  history: {
    index: 'Account',
    title: 'History',
    empty:
      'Nothing yet — add a Gemini key and point the metadata tool at a folder.',
    summary: (files: number, runs: number) =>
      `${files} file${files === 1 ? '' : 's'} across your last ${runs} run${runs === 1 ? '' : 's'}, reported by the browser that did the work.`,
    noRuns: 'no runs recorded',
    openTool: 'Open the metadata tool',
    columns: {
      folder: 'Folder',
      platform: 'Platform',
      files: 'Files',
      status: 'Status',
      started: 'Started',
    },
    fallbacks: (count: number) => `(${count} fallback)`,
  },

  auth: {
    email: 'Email',
    password: 'Password',
    name: 'Name',
    namePlaceholder: 'Ada Lovelace',
    emailPlaceholder: 'you@company.com',

    signInTitle: 'Sign in',
    signInDescription: 'Welcome back. Use the account you signed up with.',
    signInSubmit: 'Sign in',
    signInPending: 'Signing in…',
    signInFailed: 'Could not sign in.',
    needAccount: 'Need an account?',
    signUpLink: 'Sign up',

    signUpTitle: 'Create an account',
    signUpDescription:
      'One account for every tool on the shelf. No card, no trial.',
    signUpSubmit: 'Create account',
    signUpPending: 'Creating…',
    signUpFailed: 'Could not create the account.',
    passwordHint: 'At least 8 characters.',
    haveAccount: 'Already have an account?',
    signInLink: 'Sign in',
  },
}

/** The contract every other locale has to satisfy, structurally. */
export type Messages = typeof en
