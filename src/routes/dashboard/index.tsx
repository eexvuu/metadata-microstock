import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ArrowRight, KeyRound, Lock, PenTool, Sparkles } from 'lucide-react'

import { PageHead } from '#/components/page-head'
import { Button } from '#/components/ui/button'
import { useMessages } from '#/lib/i18n'
import { listGeminiKeys } from '#/lib/server/gemini-keys'

/**
 * The shelf.
 *
 * Stockflow is a set of tools, not one app with a dashboard, so this screen
 * says nothing about any single tool beyond its card. A tool's runs, its
 * history and its settings live inside the tool — including its keys, which
 * are only loaded here to say whether a card is ready to open.
 *
 * Adding a tool is one entry in `TOOLS` and one line of copy per locale.
 *
 * A tool can be `adminOnly` while it is being built. Everyone sees its card —
 * an ordinary account sees it as **coming soon**, with no way in. The card is
 * advertising, never access: the gate is the tool's own loader, which calls
 * `requireAdmin` and redirects. So the worst a wrong answer here can do is
 * show somebody a teaser or hide one, never open a door.
 *
 * It used to hide the card entirely, on the reasoning that advertising a door
 * nobody can open is unkind. A tool that is genuinely coming is the other
 * case: saying "coming soon" is the honest version of the same courtesy, and
 * an empty shelf said less than a locked card does.
 */
export const Route = createFileRoute('/dashboard/')({
  loader: () => listGeminiKeys(),
  component: CatalogPage,
})

const TOOLS = [
  {
    id: 'metadata',
    to: '/tools/metadata',
    icon: Sparkles,
    name: 'metadata',
    body: 'metadataBody',
    badge: 'free',
    adminOnly: false,
    /** The only tool that runs on a key the user brings. */
    needsKey: true,
  },
  {
    id: 'vectorizer',
    to: '/tools/vectorizer',
    icon: PenTool,
    name: 'vectorizer',
    body: 'vectorizerBody',
    badge: 'trial',
    adminOnly: false,
    // It spends our vectorizer.ai credit, not a key — so the "needs a Gemini
    // key" hint below must not follow it. That hint used to be unconditional
    // and it was only ever right because this card was locked.
    needsKey: false,
  },
] as const

/**
 * The same signal the dashboard shell uses: `getPanelNav` returns nothing at
 * all for a non-admin, because every panel resource is admin-gated. Reading
 * the parent's loader data costs no second round trip.
 */
const shell = getRouteApi('/dashboard')

function CatalogPage() {
  const m = useMessages()
  const keys = Route.useLoaderData()
  const isAdmin = shell.useLoaderData().length > 0
  const activeKeys = keys.filter((key) => key.status === 'active').length

  return (
    <div className="space-y-8">
      <PageHead index={m.catalog.index} title={m.catalog.title}>
        {m.catalog.lead}
      </PageHead>

      <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          /** Rendered, never reachable — the tool's own loader is the gate. */
          const locked = tool.adminOnly && !isAdmin

          return (
            <article
              key={tool.id}
              className="border-(--line) bg-card flex flex-col border p-6"
            >
              <div className="flex items-center justify-between">
                <Icon className="text-primary size-5" strokeWidth={1.5} />
                <span
                  className={`border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase ${
                    locked
                      ? 'border-(--line) text-muted-foreground'
                      : 'border-primary/40 text-primary'
                  }`}
                >
                  {locked ? m.catalog.comingSoon : m.catalog[tool.badge]}
                </span>
              </div>

              <h2 className="font-display mt-5 text-2xl font-medium">
                {m.nav[tool.name]}
              </h2>
              <p className="text-muted-foreground mt-2 grow text-sm text-pretty">
                {m.catalog[tool.body]}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {/*
                  * Disabled and NOT a link: a locked card must not put the
                  * route in the DOM for a middle-click to find. The redirect
                  * behind it is what actually refuses.
                  */}
                {locked ? (
                  <Button disabled className="eyebrow">
                    <Lock className="size-4" />
                    {m.catalog.notYet}
                  </Button>
                ) : (
                  <Button asChild className="eyebrow">
                    <Link to={tool.to}>
                      {m.catalog.open}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )}
                {!locked && tool.needsKey && activeKeys === 0 ? (
                  <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-xs">
                    <KeyRound className="size-3.5" />
                    {m.catalog.needKey}
                  </span>
                ) : null}
              </div>
            </article>
          )
        })}

        <article className="border-(--line) flex flex-col border border-dashed p-6">
          <div className="flex items-center justify-between">
            <span className="border-(--line) text-muted-foreground flex size-5 items-center justify-center border font-mono text-[0.6rem]">
              +
            </span>
            <span className="eyebrow text-muted-foreground/60">
              {m.catalog.planned}
            </span>
          </div>

          <h2 className="font-display text-muted-foreground mt-5 text-2xl font-medium">
            {m.catalog.nextTitle}
          </h2>
          <p className="text-muted-foreground mt-2 grow text-sm text-pretty">
            {m.catalog.nextBody}
          </p>
        </article>
      </div>
    </div>
  )
}
