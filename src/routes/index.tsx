import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  FileSpreadsheet,
  FolderOpen,
  History,
  KeyRound,
  Layers,
  PenLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { CONTAINER } from '#/components/shell'
import { Button } from '#/components/ui/button'
import { useSession } from '#/lib/auth-client'
import { useLocale, useMessages } from '#/lib/i18n'
import { getPublicStats } from '#/lib/server/runs'

export const Route = createFileRoute('/')({
  /*
   * Two aggregates — one over `user`, one over `generation_run` — on a public
   * page. They are the only things here that are not constants, and the only
   * claims a visitor cannot check for themselves, so they had better be the
   * real counts.
   */
  loader: () => getPublicStats(),
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

/**
 * Whether the visitor already has an account, which is what every call to
 * action on this page turns on. `isPending` renders as signed-out — the same
 * frame the header already spends, and the same trade.
 */
function useSignedIn() {
  const { data: session } = useSession()
  return Boolean(session)
}

/** The three that hold for every tool. */
const RULE_ICONS = [ShieldCheck, KeyRound, PenLine]

/** The four that are the metadata tool's own. */
const FEATURE_ICONS = [FolderOpen, FileSpreadsheet, Layers, History]

const SPECIMEN = [
  'Filename,Title,Keywords,Category,Releases',
  'DSC_4417.jpg,"Fisherman casting a net at sunrise over calm harbour water",fisherman,net,sunrise,harbour,…,12,',
  'A7R_0912.mov,"Aerial pass over a terraced rice field in soft morning light",aerial,drone,rice,terrace,…,4,',
]

/**
 * The shelf first, the tool second.
 *
 * The order is the argument: Stockflow is a set of tools that share an
 * account, a set of keys and three rules, and the metadata tool is the first
 * of them. Section 03 is where the page is allowed to be about one tool — and
 * it is numbered, so the next one slots in beside it rather than rewriting
 * everything above.
 */
function LandingPage() {
  return (
    <main>
      <Hero />
      <Catalog />
      <Rules />
      <FirstTool />
      <Process />
      <Close />
    </main>
  )
}

function Hero() {
  const m = useMessages()
  const { tag } = useLocale()
  const { users, files } = Route.useLoaderData()
  const signedIn = useSignedIn()

  /*
   * Two counts and a promise. The third is a fact about how the tool is built
   * rather than a measurement, which is why it is the only literal left.
   */
  const stats = [users.toLocaleString(tag), files.toLocaleString(tag), '100%']

  return (
    <section className="safelight sheet-grid border-(--line) relative overflow-hidden border-b">
      <div className={`${CONTAINER} relative grid gap-14 py-20 sm:py-28 lg:grid-cols-[1.15fr_0.85fr] lg:items-center`}>
        <div className="stagger">
          <p className="eyebrow text-primary reveal flex items-center gap-2">
            <span className="bg-primary size-1.5" />
            {m.landing.eyebrow}
          </p>

          <h1 className="font-display reveal mt-6 text-5xl leading-[0.95] font-light tracking-tight text-balance sm:text-7xl">
            {m.landing.headline}
          </h1>

          <p className="text-muted-foreground reveal mt-7 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
            {m.landing.lead}
          </p>

          <div className="reveal mt-9 flex flex-wrap items-center gap-6">
            <Button asChild size="lg" className="eyebrow h-11 px-5">
              <Link to={signedIn ? '/dashboard' : '/signup'}>
                {signedIn ? m.landing.ctaDashboard : m.landing.ctaPrimary}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {/* Nothing to sign in to when you already are. */}
            {signedIn ? null : (
              <Link
                to="/login"
                className="eyebrow text-muted-foreground hover:text-foreground decoration-primary underline underline-offset-8 transition-colors"
              >
                {m.landing.ctaSecondary}
              </Link>
            )}
          </div>

          <dl className="border-(--line) reveal mt-12 grid max-w-lg grid-cols-3 border-t pt-6">
            {m.landing.stats.map((label, index) => (
              <div key={label}>
                <dt className="font-display text-3xl leading-none font-medium tabular-nums">
                  {stats[index]}
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
  const m = useMessages()

  return (
    <div className="relative">
      <div className="border-(--line) bg-card/60 crop-marks border p-3 backdrop-blur-sm sm:p-4">
        <div className="border-(--line) mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2">
          <span className="eyebrow text-primary/80">{m.landing.sheetTool}</span>
          <span className="eyebrow text-muted-foreground">
            /shoot-2026-04-harbour
          </span>
          <span className="ml-auto" />
          <span className="eyebrow text-primary developing flex items-center gap-1.5">
            <span className="bg-primary size-1.5" />
            {m.landing.sheetStatus}
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
            {m.landing.sheetFooter}
          </span>
          <span className="eyebrow text-foreground">adobe-stock.csv</span>
        </div>
      </div>

      <span className="sprockets absolute -top-2 -bottom-2 -left-3 hidden w-2 opacity-60 lg:block" />
    </div>
  )
}

function Catalog() {
  const m = useMessages()
  const signedIn = useSignedIn()

  return (
    <section className={`${CONTAINER} py-20`}>
      <SectionHead index="01" title={m.landing.catalogTitle} />
      <p className="text-muted-foreground mt-5 max-w-2xl text-pretty">
        {m.landing.catalogLead}
      </p>

      <div className="border-(--line) mt-10 grid border-t border-l sm:grid-cols-2">
        <article className="border-(--line) border-r border-b p-7">
          <div className="flex items-center justify-between">
            <Sparkles className="text-primary size-5" strokeWidth={1.5} />
            <span className="border-primary/40 text-primary border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase">
              {m.landing.catalogFree}
            </span>
          </div>
          <h3 className="font-display mt-5 text-2xl font-medium">
            {m.nav.metadata}
          </h3>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
            {m.landing.catalogMetadata}
          </p>
          <Link
            to={signedIn ? '/tools/metadata' : '/signup'}
            className="text-primary eyebrow mt-6 inline-flex items-center gap-1.5 hover:underline"
          >
            {signedIn
              ? m.landing.catalogMetadataOpen
              : m.landing.catalogMetadataCta}
            <ArrowRight className="size-3" />
          </Link>
        </article>

        <article className="border-(--line) border-r border-b p-7">
          <div className="flex items-center justify-between">
            <span className="border-(--line) text-muted-foreground flex size-5 items-center justify-center border font-mono text-[0.6rem]">
              +
            </span>
            <span className="eyebrow text-muted-foreground/60">
              {m.landing.catalogPlanned}
            </span>
          </div>
          <h3 className="font-display text-muted-foreground mt-5 text-2xl font-medium">
            {m.landing.catalogNextTitle}
          </h3>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
            {m.landing.catalogNext}
          </p>
        </article>
      </div>
    </section>
  )
}

function Process() {
  const m = useMessages()

  return (
    <section className={`${CONTAINER} py-20`}>
      <SectionHead index="04" title={m.landing.processTitle} />

      <ol className="mt-10 grid gap-px sm:grid-cols-3">
        {m.landing.steps.map((step, index) => (
          <li
            key={step.title}
            className="border-(--line) group relative border-t pt-6 sm:border-r sm:pr-6 sm:last:border-r-0"
          >
            <span className="font-display text-muted-foreground/35 group-hover:text-primary/70 text-6xl leading-none font-light transition-colors">
              {index + 1}
            </span>
            <h3 className="font-display mt-4 text-xl font-medium">
              {step.title}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-xs text-sm leading-relaxed text-pretty">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Rules() {
  const m = useMessages()

  return (
    <section className="border-(--line) border-y">
      <div className={`${CONTAINER} py-20`}>
        <SectionHead index="02" title={m.landing.rulesTitle} />
        <p className="text-muted-foreground mt-5 max-w-2xl text-pretty">
          {m.landing.rulesLead}
        </p>

        <div className="mt-10 grid gap-px sm:grid-cols-3">
          {m.landing.rules.map((rule, index) => {
            const Icon = RULE_ICONS[index]

            return (
              <article
                key={rule.title}
                className="border-(--line) border-t pt-6 sm:border-r sm:pr-7 sm:last:border-r-0"
              >
                <Icon className="text-primary size-5" strokeWidth={1.5} />
                <h3 className="font-display mt-5 text-xl font-medium text-balance">
                  {rule.title}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
                  {rule.body}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/**
 * Where the page is allowed to be about one tool.
 *
 * Everything above holds for the shelf; this section is the metadata tool's
 * own — what it does, and the CSV it leaves behind.
 */
function FirstTool() {
  const m = useMessages()

  return (
    <section className={`${CONTAINER} py-20`}>
      <SectionHead index="03" title={m.landing.firstToolTitle} />
      <p className="text-muted-foreground mt-5 max-w-2xl text-pretty">
        {m.landing.firstToolLead}
      </p>

      <div className="border-(--line) mt-10 grid border-t border-l sm:grid-cols-2">
        {m.landing.features.map((feature, index) => {
          const Icon = FEATURE_ICONS[index]

          return (
            <article
              key={feature.title}
              className="border-(--line) hover:bg-accent/40 group relative border-r border-b p-6 transition-colors sm:p-7"
            >
              <div className="flex items-center justify-between">
                <Icon className="text-primary size-5" strokeWidth={1.5} />
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
          )
        })}
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <h3 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
            {m.landing.specimenTitle}
          </h3>
          <p className="text-muted-foreground mt-4 max-w-md text-pretty">
            {m.landing.specimenLead}
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
    </section>
  )
}

function Close() {
  const m = useMessages()
  const signedIn = useSignedIn()

  return (
    <section className="safelight border-(--line) relative overflow-hidden border-t">
      <div className={`${CONTAINER} relative py-24 text-center`}>
        <h2 className="font-display text-4xl leading-[1.05] font-light tracking-tight text-balance sm:text-6xl">
          {m.landing.closeHeadline}
        </h2>
        <p className="text-muted-foreground mx-auto mt-6 max-w-lg text-pretty">
          {m.landing.closeLead}
        </p>
        <Button asChild size="lg" className="eyebrow mt-9 h-11 px-6">
          <Link to={signedIn ? '/dashboard' : '/signup'}>
            {signedIn ? m.landing.ctaDashboard : m.landing.closeCta}
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
