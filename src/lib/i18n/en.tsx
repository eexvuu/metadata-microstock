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

  /**
   * The metadata tool.
   *
   * The screen speaks the reader's language; the rows it produces do not. Note
   * what is missing on purpose: Shutterstock category names are CSV bytes, the
   * Adobe category list is Adobe's own vocabulary, and the run log's
   * lower-level lines come from `src/lib/engine/`, which cannot import this.
   */
  tool: {
    keysButton: 'Keys',
    keySummary: (keys: number, parallel: number) =>
      `${keys} key${keys === 1 ? '' : 's'} · ${parallel} parallel`,

    step1: 'Step 1 · Your media',
    step2: 'Step 2 · Where you upload',
    step3: 'Step 3 · Run it',
    stepReview: 'Step 3 · Review',
    stepUnfinished: 'Step 3 · Unfinished',

    partialNote: (done: number, total: number) =>
      `${done} of ${total} files got through before the keys ran out. Run it again — it picks up where it stopped — and the CSV is written once every file is done.`,
    exportedNote: (csvName: string) =>
      `${csvName} is done. Edit and export again if you change your mind.`,
    reviewNote:
      'Nothing has been written yet. Fix anything that looks wrong, then export.',
    continueRun: 'Continue the run',
    startOver: 'Start over',

    scanning: 'reading the folder…',
    counts: (files: number, images: number, videos: number) =>
      `${files} file${files === 1 ? '' : 's'} · ${images} images · ${videos} videos`,
    unreadable: (names: string) =>
      `${names} could not be opened — an .ai only works when it was saved with "Create PDF Compatible File" ticked. Re-save it, or export a JPEG.`,
    skipped: (names: string, extension: string) =>
      `${names} skipped — this tool cannot open those. Export a JPEG, PNG or MP4 of them and drop that instead; you can still name the CSV rows ${extension} on the review screen.`,
    nothingReadable:
      'Nothing readable in there. JPG, PNG, WEBP, SVG, AI, PDF, MP4, MOV and M4V are the formats this tool can open.',

    adobeDetail: 'Title, 49 keywords, one category number.',
    shutterstockDetail: 'Description, 49 keywords, up to two category names.',

    working: 'Working…',
    writeMetadata: 'Write my metadata',
    stop: 'Stop',
    needKeyFirst: 'add a Gemini key first — it takes a minute and it is free',
    needMediaFirst: 'drop some photos above to start',
    progress: (done: number, total: number) => `${done} / ${total} files`,

    keysInRotation: 'Keys in rotation',
    manage: 'Manage',
    rotationNote:
      'Each key works at ~15 requests a minute. One that hits a limit cools down while the others carry on, so more keys is simply faster.',

    csvWritten: (csvName: string) => `${csvName} written next to your media`,
    csvDownloaded: (csvName: string) => `${csvName} downloaded`,
  },

  picker: {
    title: 'Drag a folder of photos here',
    body: 'Photos, videos, SVG, and Illustrator files — nothing is uploaded. The page reads them off your disk and sends each one straight to Google with your own key.',
    chooseFolder: 'Choose folder',
    chooseFiles: 'Choose files',
    noFolderSupport:
      'this browser cannot open a folder — Chrome or Edge can, and then the CSV is written next to your media instead of downloaded',
    nothingUsable: 'Nothing usable in that drop — images and videos only.',
    fileCount: (files: number) => `${files} file${files === 1 ? '' : 's'}`,
    folderMode: 'folder · CSV written back, run resumes if interrupted',
    filesMode: 'files · CSV downloaded, no resume',
    clear: 'Clear',
    videoBadge: 'video',
    more: (rest: number) =>
      `+ ${rest} more file${rest === 1 ? '' : 's'} in the queue`,
  },

  keys: {
    railEmpty: 'no active keys — add one above',
    keyN: (index: number) => `key ${index}`,
    filesDone: (files: number) => `${files} files`,
    idle: 'idle',
    ready: 'ready',
    busy: 'working',
    outOfQuota: 'out of quota',
    cooling: (seconds: number) => `cooling ${seconds}s`,

    dialogTitle: 'Your Gemini keys',
    dialogDescription: (
      <>
        Free from{' '}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          aistudio.google.com/apikey
        </a>
        . Every key adds about 15 requests a minute, so two keys is twice as
        fast. They are encrypted before they are stored. A full key leaves our
        server when this tab needs it to call Google — and if you ask us for
        help, an admin can reveal it to look into the problem. Every reveal is
        recorded against the admin who did it.
      </>
    ) as ReactNode,
    labelOptional: 'Label (optional)',
    labelPlaceholder: 'Personal account',
    addAndVerify: 'Add and verify',
    pasteHint: (
      <>
        One per line — paste your{' '}
        <code className="border-(--line) text-foreground border px-1 font-mono text-[0.7rem]">
          gemini-key.txt
        </code>{' '}
        as-is, comments and blank lines included. Each key is checked against
        Google before it is saved.
      </>
    ) as ReactNode,
    added: (count: number) => `${count} key${count === 1 ? '' : 's'} added`,
    removed: (preview: string) => `${preview} removed`,
    removeAria: (preview: string) => `Remove ${preview}`,
    columnLabel: 'Label',
    columnKey: 'Key',
    columnStatus: 'Status',
    columnLastUsed: 'Last used',
    columnActions: 'Actions',
    never: 'never',
    enable: 'Enable',
    disable: 'Disable',
    status: { active: 'active', disabled: 'disabled' },
    empty: 'no keys yet — paste one above and the tool is ready',
    firstBody:
      'This tool runs on your own Google key, which is free and takes a minute to make. Nothing else is needed.',
    firstCta: 'Add your Gemini key',
  },

  options: {
    heading: 'Shutterstock columns',
    changedAria: 'changed from defaults',
    illustration: 'Illustration column',
    illustrationAuto: 'Auto — the model decides',
    illustrationYes: 'Force yes',
    illustrationNo: 'Force no',
    editorial: 'Editorial = yes',
    mature: 'Mature content = yes',
  },

  review: {
    logHeading: 'Run log',
    rowsReady: 'rows ready',
    needLook: (count: number) => `${count} need a look`,
    filterPlaceholder: 'Filter rows…',
    bulkKeywordPlaceholder: 'Keyword for every row',
    addToAllAria: 'Add to all rows',
    extensionAria: 'Extension for every row',
    extensionPlaceholder: 'Extension for all rows…',
    renameEvery: (extension: string) => `rename every row to ${extension}`,
    writeCsv: 'Write CSV to folder',
    downloadCsv: 'Download CSV',
    fallbackNote: (model: string) =>
      `${model} fallback — written by hand or re-run`,
    filenameInCsv: 'Filename in the CSV',
    onDisk: (name: string) => `on disk: ${name}`,
    titleLabel: 'Title',
    descriptionLabel: 'Description',
    chars: (count: number) => `${count} chars`,
    keywords: 'Keywords',
    keywordPlaceholder: '+ keyword',
    category: 'Category',
    categories: 'Categories',
    noMatch: 'nothing matches that filter',
    issues: {
      noFilename: 'no filename',
      badFilename: 'filename has a slash or a line break',
      noTitle: 'no title yet',
      noKeywords: 'no keywords',
      overLimit: (over: number) => `${over} keyword(s) over the limit`,
      adobeComma: 'Adobe titles cannot contain a comma or quote',
      noCategory: 'no category',
    },
  },

  /**
   * The run log's own lines. The engine writes its own prose in English and
   * cannot import this module — these are the ones the hook formats, which is
   * everything a reader actually follows during a run.
   */
  log: {
    cancelled: 'Cancelled — progress is saved, re-run to resume.',
    noKeys: 'No active API keys on this account — add one in Keys.',
    scanned: (total: number, images: number, videos: number, skipped: number) =>
      `${total} media files (${images} images, ${videos} videos); ${skipped} other files ignored`,
    fileFailed: (name: string, message: string, requeued: boolean) =>
      `${name}: ${message}${requeued ? ' — requeued' : ' — using fallback row'}`,
    keyCooldown: (index: number, consecutive: number) =>
      `Key ${index} rate-limited (429) — cooling down 60s (${consecutive}/5)`,
    keyDead: (index: number) => `Key ${index} is out of quota for today`,
    modelFallback: (name: string, model: string) =>
      `${name}: retrying on ${model}`,
    partial: (done: number, total: number, remaining: number) =>
      `Partial run: ${done}/${total} done, ${remaining} left. No CSV yet — re-run to resume.`,
    finished: (csvName: string, rows: number) =>
      `Wrote ${csvName} (${rows} rows)`,
  },
}

/** The contract every other locale has to satisfy, structurally. */
export type Messages = typeof en
