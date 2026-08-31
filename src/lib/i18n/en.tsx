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
    catalog: 'Catalog',
    metadata: 'Metadata',
    vectorizer: 'Vectorizer',
    platform: 'Platform',
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
    stamp: "Google's model · your keys · your machine",
  },

  landing: {
    eyebrow: 'Stockflow · a shelf of tools, free today',
    headline: (
      <>
        The upload routine,{' '}
        <em className="text-primary font-normal italic">one tool at a time</em>.
      </>
    ) as ReactNode,
    lead: 'Stockflow is a shelf of small tools for people who upload to microstock. One account, one set of your own Google API keys, and a room of its own for every job. The first tool writes the metadata CSV for a whole folder; the ones after it take on the rest of the routine.',
    ctaPrimary: 'Create a free account',
    ctaSecondary: 'Sign in',
    ctaDashboard: 'Open your dashboard',
    stats: [
      'contributors with an account',
      'files given metadata so far',
      'of the work happens in your own browser',
    ],
    sheetTool: 'tool 01 · metadata',
    sheetStatus: 'developing',
    sheetFooter: '6 / 6 files · 291 keywords',

    catalogTitle: 'On the shelf',
    catalogLead:
      'A tool per job, and nothing shared between them but your account and your keys. Open one and its runs, its history and its settings stay inside it — so the shelf can grow without any of them getting in each other’s way.',
    catalogFree: 'free',
    catalogPlanned: 'planned',
    catalogMetadata:
      "A folder of images and videos in, an Adobe Stock or Shutterstock CSV out. Resumable, multi-key, and free for as long as Google's free tier exists.",
    catalogMetadataCta: 'Start with this one',
    catalogMetadataOpen: 'Open the tool',
    catalogNextTitle: 'The next tool',
    catalogNext:
      'More of the upload routine belongs here. Whatever lands next shares the same account and the same keys, and plays by the same three rules below.',

    rulesTitle: 'The house rules',
    rulesLead:
      'Three things are true of every tool on this shelf, and will stay true of the ones that are not written yet.',
    rules: [
      {
        title: 'Your media never reaches us',
        body: 'The work happens in your browser and talks to Google directly. Your photos and footage are never uploaded to us — we do not even have somewhere to put them.',
      },
      {
        title: 'Your keys, your quota',
        body: 'Bring your own free Google API keys. They are encrypted on your account, spent only by you, and every tool on the shelf draws from the same set.',
      },
      {
        title: 'Nothing is final until you say so',
        body: 'A tool proposes, you decide. Whatever it produced is yours to edit before anything is written, and you can reopen a finished job for a week afterwards.',
      },
    ],

    firstToolTitle: 'The first tool: metadata',
    firstToolLead:
      'Titles, 49 keywords and the right category for every image and video in a folder, written straight into the CSV Adobe Stock and Shutterstock ask for.',

    specimenTitle: 'What lands in the folder',
    specimenLead:
      'One CSV, byte-for-byte the shape each platform accepts — the BOM, the quoting, the line endings. Drop it into the upload queue without opening a spreadsheet.',

    featuresTitle: 'What it does',
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
        title: 'Vector uploads, without the fuss',
        body: 'Upload the JPEG or SVG you exported, then set the filename the CSV should carry — .eps, .ai, .mp4, anything — for one row or for all of them at once.',
      },
      {
        title: 'A week to change your mind',
        body: 'Every finished run stays openable for seven days: fix a title, add a keyword, take a fresh CSV. After that only the numbers remain.',
      },
    ],

    processTitle: 'How it works',
    steps: [
      {
        title: 'Create an account',
        body: 'Free, no card, and nothing to configure before the first run.',
      },
      {
        title: 'Add your Google keys',
        body: 'Pasted once, verified against Google, then encrypted on your account — and every tool on the shelf can use them.',
      },
      {
        title: 'Open a tool and work',
        body: 'Today that is the metadata tool: drag your folder in, check what it wrote, take the CSV.',
      },
    ],

    closeHeadline: (
      <>
        Get the boring half of the upload{' '}
        <em className="text-primary font-normal italic">off your desk</em>.
      </>
    ) as ReactNode,
    closeLead:
      'Add your keys once. Every tool that lands on this shelf after that is already set up and already free.',
    closeCta: 'Get started',
  },
  catalog: {
    index: 'Catalog',
    title: 'Your tools',
    lead: 'One account, one set of keys, and a room of its own for every tool. Open one to work inside it — its runs, its history and its settings stay there.',
    free: 'free',
    trial: 'free trial',
    adminOnly: 'admin only',
    comingSoon: 'coming soon',
    planned: 'planned',
    vectorizerBody:
      'Raster art traced to 4000 px SVG and EPS, batch at a time, on the settings Shutterstock and Adobe Stock accept. Runs on tokens rather than on your own key, and every new account gets a handful to try it with.',
    metadataBody:
      'Titles, 49 keywords and the right category for a whole folder of images and videos, written into the CSV Adobe Stock and Shutterstock ask for.',
    open: 'Open',
    notYet: 'not open yet',
    needKey: 'needs a free Gemini key',
    nextTitle: 'The next tool',
    nextBody: (
      <>
        This shelf is built to hold more than one thing. A new tool is a folder
        under <code className="font-mono text-xs">src/lib/</code> and a card
        here — the account and the keys are already shared. Its runs and its
        history stay in its own room.
      </>
    ) as ReactNode,
  },

  history: {
    index: 'Metadata',
    title: 'History',
    empty:
      'Nothing yet — add a Gemini key and point the metadata tool at a folder.',
    summary: (files: number, runs: number) =>
      `${files} file${files === 1 ? '' : 's'} across your last ${runs} run${runs === 1 ? '' : 's'}, reported by the browser that did the work.`,
    noRuns: 'no runs recorded',
    openTool: 'Start a run',
    columns: {
      folder: 'Folder',
      platform: 'Platform',
      files: 'Files',
      status: 'Status',
      started: 'Started',
      result: 'Result',
    },
    fallbacks: (count: number) => `(${count} fallback)`,

    open: 'Open',
    expired: 'expired',
    expiresIn: (days: number) =>
      days <= 0 ? 'goes today' : `${days} day${days === 1 ? '' : 's'} left`,
    resultsNote:
      'A finished run keeps its rows for seven days so you can open it, fix a title and take a fresh CSV. After that only the numbers above remain. While a result is still here, an admin can open it too if you ask us for help with it — every time one does, it is recorded against them.',

    resultTitle: 'Saved result',
    resultGone: 'This result has expired.',
    resultGoneBody:
      'Rows are kept for seven days after a run. The run itself is still in your history — only the editable result is gone.',
    backToHistory: 'Back to history',
    resultSaved: 'Saved',
    resultSaveFailed: 'Could not save those edits.',
    save: 'Save edits',
    saving: 'Saving…',
    previewsMissing:
      'No previews in this browser — thumbnails are kept on the machine that did the run, never on our server, so they only show up there.',
  },

  auth: {
    signInTitle: 'Sign in',
    signInDescription:
      'One account for every tool on the shelf. No card, no trial.',
    google: 'Continue with Google',
    googlePending: 'Opening Google…',
    googleFailed: 'Could not reach Google. Try again.',
    /**
     * Better Auth sends a refused sign-in back here with ?error=<code>. Only
     * the one people will actually meet is spelled out; the rest get the
     * fallback rather than a code they cannot act on.
     */
    errors: {
      account_not_linked:
        'An account already exists for that address, and it has not been verified — so we will not attach a Google login to it automatically. Ask an admin to verify it, then sign in again.',
      fallback: 'Google turned that sign-in down. Try again.',
    } as Record<string, string>,
    /**
     * Said plainly on the page rather than discovered at the button: someone
     * arriving with a password in their manager deserves to know why there is
     * nowhere to type it.
     */
    whyGoogle:
      'Google is the only way in. Signing in creates your account the first time — there is no separate sign-up, and no password for us to lose.',
    keysNote:
      'This tool holds the Gemini keys you add to it, so it deliberately stores no password of yours.',
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
    keyCount: (keys: number) =>
      `${keys} key${keys === 1 ? '' : 's'} on this account`,
    tabGenerate: 'Generate',
    tabHistory: 'History',

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

    resumeTitle: 'An unfinished run',
    resumeBody: (folder: string, done: number, total: number) =>
      `${done} of ${total} files in ${folder} were done before this tab closed. Continue and the finished ones are skipped — no key pays for the same file twice.`,
    resumeAction: 'Continue in that folder',
    resumeDismiss: 'Forget it',
    resumeDenied:
      'Without permission for that folder there is nothing to read. Choose it again below and the run picks up where it stopped.',
    runningNote:
      'Keep this tab open — the model is being called from here. Close it and everything finished so far is kept, in the folder and in History.',

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
    manage: 'Manage keys',
    keysUsed: 'Use at once',
    keysAll: (keys: number) => `all ${keys} key${keys === 1 ? '' : 's'}`,
    keysExactly: (keys: number) => `${keys} key${keys === 1 ? '' : 's'}`,
    workersUsed: 'Files at once',
    workersAuto: (workers: number) => `auto (${workers})`,
    workersExactly: (workers: number) =>
      `${workers} file${workers === 1 ? '' : 's'}`,
    workersNote:
      'Past eight at once the gain comes from small files and a fast line — a video run can run this tab out of memory instead. Every worker needs a key of its own, so the list stops at the keys in play.',
    keysHeldBack: (held: number) =>
      `${held} key${held === 1 ? '' : 's'} sitting this run out — that quota stays untouched.`,
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
    firstTitle: 'One free key, then you can run this',
    firstBody:
      'This tool runs on your own Google Gemini key. It is free, it takes about a minute to make, and nothing else is needed.',
    firstCta: 'Add your Gemini key',
    firstWhere: (
      <>
        Do not have one? Sign in at{' '}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-4"
        >
          aistudio.google.com/apikey
        </a>
        , press <strong className="text-foreground">Create API key</strong>,
        then paste it here.
      </>
    ) as ReactNode,
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
    fallbackNote: 'backup model — written by hand or re-run',
    notGenerated: 'Not generated —',
    filenameInCsv: 'Filename in the CSV',
    onDisk: (name: string) => `on disk: ${name}`,
    titleLabel: 'Title',
    descriptionLabel: 'Description',
    chars: (count: number) => `${count} chars`,
    keywords: 'Keywords',
    keywordPlaceholder: '+ keyword',
    copyAria: (field: string) => `Copy ${field.toLowerCase()}`,
    copied: 'Copied',
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
    keyCooldown: (index: number, consecutive: number, seconds: number) =>
      `Key ${index} rate-limited (429) — waiting ${seconds}s (${consecutive}/5)`,
    keyDead: (index: number) => `Key ${index} is out of quota for today`,
    keyDemoted: (index: number) =>
      `Key ${index} has spent today's fast quota — it carries on with the backup model, which is slower but has far more of it`,
    modelFallback: (name: string) => `${name}: retrying on the backup model`,
    partial: (done: number, total: number, remaining: number) =>
      `Partial run: ${done}/${total} done, ${remaining} left. No CSV yet — re-run to resume.`,
    finished: (csvName: string, rows: number) =>
      `Wrote ${csvName} (${rows} rows)`,
  },

  /**
   * The vectorizer, the second tool on the shelf.
   *
   * These are here because the tool went public. While it was admin-only its
   * copy was hardcoded English, on the reasoning that translating a screen
   * with one reader is copy that gets rewritten before anyone sees it — which
   * was true, and stopped being true the moment the card unlocked. An
   * Indonesian contributor meeting a tool that spends their trial credit in a
   * language the rest of the app does not use is the worst place to save an
   * afternoon.
   *
   * The trial number is a parameter rather than a word, because `SIGNUP_GRANT`
   * lives in `src/lib/server/tokens.ts` and copy must not be the second place
   * it is written down.
   */
  vectorizer: {
    index: 'Vectorizer',
    title: 'Images to SVG and EPS',
    badge: 'beta',
    vectorize: 'Vectorize',
    tokens: (count: number) => `${count} token${count === 1 ? '' : 's'}`,
    lead: (trial: number) =>
      `Raster art in, 4000 px SVG and EPS out, on the settings Shutterstock and Adobe Stock accept. One image costs one token and a file that does not come back gives its token back. Every account starts with ${trial}, and every finished file keeps all three: your original, the SVG and the EPS.`,
    queueNote:
      'Tracing happens on our machines, a few images at a time, so a batch can sit in the queue for a while before it moves. This page keeps itself up to date — you can close it and come back.',
    storageMissing: (
      <>
        Storage is not configured on this server, so nothing can be uploaded.
        Set the <code className="font-mono text-xs">R2_*</code> variables — see{' '}
        <code className="font-mono text-xs">.env.example</code>.
      </>
    ) as ReactNode,

    picker: {
      drop: 'Drop images here, or pick them.',
      hint: (mb: number) => `PNG · JPEG · GIF · BMP · WebP · up to ${mb} MB each`,
      choose: 'Choose images',
      notRaster: (name: string) =>
        `${name} — this tracer takes raster art (PNG, JPEG, GIF, BMP, WebP)`,
      tooBig: (name: string, mb: number) => `${name} — over ${mb} MB`,
      empty: (name: string) => `${name} — empty`,
      sameStem: (name: string, other: string) =>
        `${name} — same name as ${other} before the extension; both would save as one .svg`,
      onlyFirst: (max: number) =>
        `Only the first ${max} files were kept — that is one batch.`,
    },

    batch: {
      label: 'Name this batch',
      placeholder: (count: number) => `${count} image${count === 1 ? '' : 's'}`,
      cost: (files: number, cost: number, balance: number) =>
        `${files} file${files === 1 ? '' : 's'} · ${cost} token${cost === 1 ? '' : 's'} · ${balance} available`,
      queue: 'Queue batch',
      uploading: (done: number, total: number) => `Uploading ${done}/${total}`,
      cantAfford: (cost: number, balance: number) =>
        `This batch costs ${cost} and your balance is ${balance}. Ask us for more and we can add them to your account.`,
      remove: (name: string) => `Remove ${name}`,
      uploadFailed: (name: string, detail: string) => `${name}: ${detail}`,
      uploadFailedStatus: (status: number) => `upload failed (${status})`,
      uploadFailedPlain: 'upload failed',
    },

    jobs: {
      heading: 'Batches',
      empty: 'Nothing queued yet. Drop some images above.',
      batch: 'Batch',
      status: 'Status',
      done: 'Done',
      failed: 'Failed',
      tokens: 'Tokens',
      created: 'Created',
      open: 'Open',
    },

    job: {
      back: 'All batches',
      progress: (done: number, total: number) => `${done} of ${total} done`,
      refunded: (count: number) =>
        `, ${count} failed and refunded`,
      charged: (count: number) => `${count} token${count === 1 ? '' : 's'} charged`,
      refreshing: 'this page refreshes itself while the worker runs',
      file: 'File',
      note: 'Note',
      download: 'Download',
      original: 'Original',
      svg: 'SVG',
      eps: 'EPS',
    },

    bulk: {
      button: 'Download all as zip',
      zipping: (done: number, ready: number) => `Zipping ${done}/${ready}`,
      summary: (images: number, files: number) =>
        `${images} image${images === 1 ? '' : 's'} · ${files} files (original + SVG + EPS)`,
      nothingReady: 'Nothing finished in this batch yet.',
      nothingDownloaded:
        'Nothing downloaded — the batch may have passed its retention window.',
      someFailed: (packed: number, failed: number) =>
        `Zipped ${packed} file${packed === 1 ? '' : 's'}, ${failed} failed.`,
      saved: (images: number, files: number, folder: string) =>
        `${images} image${images === 1 ? '' : 's'} — ${files} files in ${folder}.zip`,
      fileFailed: (name: string, detail: string) => `${name}: ${detail}`,
      couldNotDownload: 'could not download',
      r2Answered: (status: number) => `storage answered ${status}`,
    },

    toast: {
      refunded: (count: number) =>
        `${count} file${count === 1 ? '' : 's'} did not upload — ${count} token${count === 1 ? '' : 's'} refunded.`,
      nothingQueued: 'Nothing was uploaded, so nothing was queued.',
      queued: (count: number) => `${count} file${count === 1 ? '' : 's'} queued.`,
    },

    ledger: {
      heading: 'Recent token activity',
      signup: 'trial credit',
      grant: 'added for you',
      spend: 'batch',
      refund: 'refunded',
      adjust: 'adjustment',
    },
  },
}

/** The contract every other locale has to satisfy, structurally. */
export type Messages = typeof en
