import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  FileSpreadsheet,
  FolderOpen,
  KeyRound,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
export const Route = createFileRoute('/')({
  component: LandingPage,
})

/**
 * A stand-in contact sheet. There is no real thumbnail to show — the media
 * never reaches our server — so the frames are drawn from the palette and
 * carry the only thing we ever see: filenames and counts.
 */
const SHEET = [
  { file: 'DSC_4417.jpg', keywords: 49, angle: 145, tint: 44 },
  { file: 'sunrise_pier.jpg', keywords: 49, angle: 215, tint: 22 },
  { file: 'A7R_0912.mov', keywords: 47, angle: 60, tint: 34 },
  { file: 'market_[spices].jpg', keywords: 49, angle: 320, tint: 16 },
  { file: 'IMG_0031.jpg', keywords: 48, angle: 100, tint: 28 },
  { file: 'drone_coast.mp4', keywords: 49, angle: 250, tint: 40 },
]

const STATS = [
  ['49', 'keywords per file'],
  ['14,400', 'free requests per key'],
  ['0', 'bytes of media uploaded'],
]

const STEPS = [
  [
    'Create an account',
    'Free, and a workspace is made for you on the way in.',
  ],
  [
    'Add your Gemini keys',
    'Pasted once, verified against Google, then encrypted on your account.',
  ],
  [
    'Drag your photos in',
    'Check the titles and keywords it wrote, fix anything you like, then take the CSV.',
  ],
]

const FEATURES = [
  {
    icon: FolderOpen,
    title: 'A whole folder at once',
    body: 'Drag in a folder of images and videos. Every file is analysed and the CSV lands back next to your media, ready to upload.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Adobe and Shutterstock',
    body: 'Each platform gets its own prompt, its own keyword limit and its exact CSV shape — BOM where Adobe wants one, category names where Shutterstock wants those.',
  },
  {
    icon: KeyRound,
    title: 'Your keys, your quota',
    body: 'Bring your own free Gemini keys. Each one adds about 15 requests a minute, and the run spreads work across all of them.',
  },
  {
    icon: RefreshCw,
    title: 'You get the last word',
    body: 'Nothing is written until you say so: every title, keyword and category is editable next to the picture it came from, and only then does the CSV get made.',
  },
  {
    icon: ShieldCheck,
    title: 'Media never leaves your machine',
    body: 'The analysis runs in your browser and talks to Google directly. Your photos and footage are never uploaded to us — we do not even have somewhere to put them.',
  },
  {
    icon: Layers,
    title: 'Vector uploads, without the fuss',
    body: 'Upload the JPEG or SVG you exported, then set the filename the CSV should carry — .eps, .ai, anything — for one row or for all of them at once.',
  },
]

const SPECIMEN = [
  'Filename,Title,Keywords,Category,Releases',
  'DSC_4417.jpg,"Fisherman casting a net at sunrise over calm harbour water",fisherman,net,sunrise,harbour,…,12,',
  'A7R_0912.mov,"Aerial pass over a terraced rice field in soft morning light",aerial,drone,rice,terrace,…,4,',
]

function LandingPage() {
  return (
    <main>
      <Hero />
      <Catalog />
      <Process />
      <Specimen />
      <Features />
      <Close />
    </main>
  )
}

function Hero() {
  return (
    <section className="safelight sheet-grid border-(--line) relative overflow-hidden border-b">
      <div className="relative mx-auto grid w-full max-w-7xl gap-14 px-4 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="stagger">
          <p className="eyebrow text-primary reveal flex items-center gap-2">
            <span className="bg-primary size-1.5" />
            Stockflow · first tool, free forever
          </p>

          <h1 className="font-display reveal mt-6 text-5xl leading-[0.95] font-light tracking-tight text-balance sm:text-7xl">
            Stock metadata for the{' '}
            <em className="text-primary font-normal italic">whole folder</em>, in
            one run.
          </h1>

          <p className="text-muted-foreground reveal mt-7 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
            Stockflow is a shelf of tools for people who upload to microstock.
            The first one writes titles, 49 keywords and the right category for
            every image and video in a folder, straight into the CSV Adobe Stock
            and Shutterstock ask for — on Google's free Gemma model and your own
            API keys.
          </p>

          <div className="reveal mt-9 flex flex-wrap items-center gap-6">
            <Button asChild size="lg" className="eyebrow h-11 px-5">
              <Link to="/signup">
                Create a free account
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Link
              to="/login"
              className="eyebrow text-muted-foreground hover:text-foreground decoration-primary underline underline-offset-8 transition-colors"
            >
              Sign in
            </Link>
          </div>

          <dl className="border-(--line) reveal mt-12 grid max-w-lg grid-cols-3 border-t pt-6">
            {STATS.map(([value, label]) => (
              <div key={label}>
                <dt className="font-display text-3xl leading-none font-medium tabular-nums">
                  {value}
                </dt>
                <dd className="text-muted-foreground mt-2 pr-4 font-mono text-[0.7rem] leading-snug">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <ContactSheet />
      </div>
    </section>
  )
}

function ContactSheet() {
  return (
    <div className="relative">
      <div className="border-(--line) bg-card/60 crop-marks border p-3 backdrop-blur-sm sm:p-4">
        <div className="border-(--line) mb-3 flex items-center justify-between border-b pb-2">
          <span className="eyebrow text-muted-foreground">
            /shoot-2026-04-harbour
          </span>
          <span className="eyebrow text-primary developing flex items-center gap-1.5">
            <span className="bg-primary size-1.5" />
            developing
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SHEET.map((frame, index) => (
            <figure key={frame.file} className="group/frame">
              <div
                className="border-(--line) relative aspect-[4/3] overflow-hidden border"
                style={{
                  backgroundImage: `linear-gradient(${frame.angle}deg, color-mix(in oklab, var(--primary) ${frame.tint}%, transparent), color-mix(in oklab, var(--foreground) 12%, transparent) 70%)`,
                }}
              >
                <span className="eyebrow bg-background/70 text-foreground/70 absolute top-1 left-1 px-1 py-px text-[0.55rem]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="border-primary/0 group-hover/frame:border-primary/70 absolute inset-1 border transition-colors" />
              </div>
              <figcaption className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground truncate font-mono text-[0.65rem]">
                  {frame.file}
                </span>
                <span className="text-primary font-mono text-[0.65rem] tabular-nums">
                  {frame.keywords}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="border-(--line) mt-3 flex items-center justify-between border-t pt-2">
          <span className="eyebrow text-muted-foreground">
            6 / 6 files · 291 keywords
          </span>
          <span className="eyebrow text-foreground">adobe-stock.csv</span>
        </div>
      </div>

      <span className="sprockets absolute -top-2 -bottom-2 -left-3 hidden w-2 opacity-60 lg:block" />
    </div>
  )
}

function Catalog() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8">
      <SectionHead index="01" title="On the shelf" />
      <p className="text-muted-foreground mt-5 max-w-2xl text-pretty">
        One account, one set of keys, and a tool for each job. Everything a tool
        knows about your media stays in the tab it runs in.
      </p>

      <div className="border-(--line) mt-10 grid border-t border-l sm:grid-cols-2">
        <article className="border-(--line) border-r border-b p-7">
          <div className="flex items-center justify-between">
            <Sparkles className="text-primary size-5" strokeWidth={1.5} />
            <span className="border-primary/40 text-primary border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase">
              free
            </span>
          </div>
          <h3 className="font-display mt-5 text-2xl font-medium">Metadata</h3>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
            A folder of images and videos in, an Adobe Stock or Shutterstock CSV
            out. Resumable, multi-key, and free for as long as Google's free tier
            exists.
          </p>
          <Link
            to="/signup"
            className="text-primary eyebrow mt-6 inline-flex items-center gap-1.5 hover:underline"
          >
            Start with this one
            <ArrowRight className="size-3" />
          </Link>
        </article>

        <article className="border-(--line) border-r border-b p-7">
          <div className="flex items-center justify-between">
            <span className="border-(--line) text-muted-foreground flex size-5 items-center justify-center border font-mono text-[0.6rem]">
              +
            </span>
            <span className="eyebrow text-muted-foreground/60">planned</span>
          </div>
          <h3 className="font-display text-muted-foreground mt-5 text-2xl font-medium">
            The next tool
          </h3>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
            More of the upload routine belongs here. Whatever lands next shares
            the same account, the same keys and the same rule: your files never
            reach our server.
          </p>
        </article>
      </div>
    </section>
  )
}

function Process() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8">
      <SectionHead index="02" title="How it works" />

      <ol className="mt-10 grid gap-px sm:grid-cols-3">
        {STEPS.map(([title, body], index) => (
          <li
            key={title}
            className="border-(--line) group relative border-t pt-6 sm:border-r sm:pr-6 sm:last:border-r-0"
          >
            <span className="font-display text-muted-foreground/35 group-hover:text-primary/70 text-6xl leading-none font-light transition-colors">
              {index + 1}
            </span>
            <h3 className="font-display mt-4 text-xl font-medium">{title}</h3>
            <p className="text-muted-foreground mt-2 max-w-xs text-sm leading-relaxed text-pretty">
              {body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Specimen() {
  return (
    <section className="border-(--line) border-y">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <SectionHead index="03" title="What lands in the folder" />
            <p className="text-muted-foreground mt-5 max-w-md text-pretty">
              One CSV, byte-for-byte the shape each platform accepts — the BOM,
              the quoting, the line endings. Drop it into the upload queue
              without opening a spreadsheet.
            </p>
          </div>

          <div className="border-(--line) bg-card overflow-hidden border">
            <div className="border-(--line) bg-muted/40 flex items-center gap-2 border-b px-3 py-2">
              <span className="bg-primary size-1.5" />
              <span className="eyebrow text-muted-foreground">
                adobe-stock.csv
              </span>
            </div>
            <div className="overflow-x-auto p-4">
              <pre className="font-mono text-[0.7rem] leading-6">
                {SPECIMEN.map((line, index) => (
                  <div
                    key={line}
                    className={
                      index === 0
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground transition-colors'
                    }
                  >
                    {line}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8">
      <SectionHead index="04" title="What you get" />

      <div className="border-(--line) mt-10 grid border-t border-l sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <article
            key={feature.title}
            className="border-(--line) hover:bg-accent/40 group relative border-r border-b p-6 transition-colors sm:p-7"
          >
            <div className="flex items-center justify-between">
              <feature.icon className="text-primary size-5" strokeWidth={1.5} />
              <span className="eyebrow text-muted-foreground/50">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <h3 className="font-display mt-5 text-xl font-medium text-balance">
              {feature.title}
            </h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
              {feature.body}
            </p>
            <span className="border-primary absolute top-0 left-0 size-0 border-t-2 border-l-2 transition-all duration-300 group-hover:size-4" />
          </article>
        ))}
      </div>
    </section>
  )
}

function Close() {
  return (
    <section className="safelight border-(--line) relative overflow-hidden border-t">
      <div className="relative mx-auto w-full max-w-4xl px-4 py-24 text-center sm:px-8">
        <h2 className="font-display text-4xl leading-[1.05] font-light tracking-tight text-balance sm:text-6xl">
          Stop writing keywords{' '}
          <em className="text-primary font-normal italic">by hand</em>.
        </h2>
        <p className="text-muted-foreground mx-auto mt-6 max-w-lg text-pretty">
          Add your keys once and every upload batch after that is one click and a
          coffee.
        </p>
        <Button asChild size="lg" className="eyebrow mt-9 h-11 px-6">
          <Link to="/signup">
            Get started
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  )
}

function SectionHead({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="eyebrow text-primary">{index}</span>
      <h2 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
        {title}
      </h2>
    </div>
  )
}
