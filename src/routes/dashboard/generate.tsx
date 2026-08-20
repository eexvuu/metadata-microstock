import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Check, KeyRound, Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'

import { KeyRail } from '#/components/generator/key-rail'
import { AdvancedOptions } from '#/components/generator/options-panel'
import { ResultTable } from '#/components/generator/result-table'
import { RunLog } from '#/components/generator/run-log'
import {
  SourcePanel,
  type SelectedSource,
  type SourceMode,
} from '#/components/generator/source-panel'
import { PageHead } from '#/components/page-head'
import { Button } from '#/components/ui/button'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import { shutterstockProfile } from '#/lib/engine/profiles/shutterstock'
import {
  DEFAULT_SETTINGS,
  clearLegacyKeyStorage,
  loadSettings,
  saveSettings,
  toRunOptions,
  workersFor,
  type StoredSettings,
} from '#/lib/generator/settings'
import { useGenerator } from '#/lib/generator/use-generator'
import { getDecryptedKeys, listGeminiKeys, markKeysUsed } from '#/lib/server/gemini-keys'
import { finishRun, startRun } from '#/lib/server/runs'

export const Route = createFileRoute('/dashboard/generate')({
  loader: () => listGeminiKeys(),
  component: GeneratePage,
})

const LOCAL_URL_STORAGE = 'microstock.local-url'
const DEFAULT_LOCAL_URL = 'http://localhost:4321'

const PLATFORMS = [
  {
    id: 'adobe' as const,
    name: 'Adobe Stock',
    detail: 'Title + 49 keywords + one category number, BOM-prefixed CSV.',
    file: 'adobe-stock.csv',
  },
  {
    id: 'shutterstock' as const,
    name: 'Shutterstock',
    detail: 'Description + 49 keywords + up to two category names, no BOM.',
    file: 'shutterstock.csv',
  },
]

function GeneratePage() {
  const keys = Route.useLoaderData()
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS)
  const [mode, setMode] = useState<SourceMode>('browser')
  const [localUrl, setLocalUrl] = useState(DEFAULT_LOCAL_URL)
  const [source, setSource] = useState<SelectedSource | null>(null)
  const { state, start, cancel } = useGenerator()

  useEffect(() => {
    setSettings(loadSettings())
    setLocalUrl(localStorage.getItem(LOCAL_URL_STORAGE) ?? DEFAULT_LOCAL_URL)
    clearLegacyKeyStorage()
  }, [])

  const activeKeys = keys.filter((key) => key.status === 'active')
  const running = state.status === 'running'
  const profile = settings.platform === 'adobe' ? adobeProfile : shutterstockProfile
  const ready = Boolean(source) && activeKeys.length > 0

  const updateSettings = (next: StoredSettings) => {
    setSettings(next)
    saveSettings(next)
  }

  const updateLocalUrl = (value: string) => {
    setLocalUrl(value)
    localStorage.setItem(LOCAL_URL_STORAGE, value)
  }

  const run = async () => {
    if (!source) return

    // Everything before the run itself can fail in ways the engine's own log
    // never sees — a dead local helper, an expired session. Without this the
    // button would just quietly do nothing.
    try {
      // Plaintext keys are fetched per run rather than held in component state,
      // so they live no longer than the run that needs them.
      const { keys: plaintext, ids } = await getDecryptedKeys()
      const fileSource = source.create()
      const options = toRunOptions(settings, plaintext.length)

      const media = await fileSource.listMedia()
      const { id: runId } = await startRun({
        data: {
          platform: options.platform,
          model: options.model,
          folderName: fileSource.folderName,
          sourceMode: source.mode,
          filesTotal: media.length,
        },
      })

      const result = await start(fileSource, plaintext, options, source.video)

      await finishRun({
        data: {
          id: runId,
          filesDone: result?.rows.length ?? 0,
          fallbacks: result?.rows.filter((row) => row.fallback).length ?? 0,
          status: result?.status ?? 'error',
        },
      })
      if (ids.length > 0) await markKeysUsed({ data: { ids } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0

  return (
    <div className="space-y-8">
      <PageHead index="Tool · Free" title="Metadata">
        Point it at a folder of images and videos: it writes{' '}
        <code className="font-mono text-xs">{profile.progressFile}</code> as it
        goes and a{' '}
        <code className="font-mono text-xs">{profile.csvPrefix}…csv</code> next
        to your files when it finishes. Your media never leaves this machine —
        the tab reads the folder and calls Google with your own keys.
      </PageHead>

      <Step
        index="01"
        title="Choose the folder"
        done={Boolean(source)}
        hint={source ? source.label : 'Nothing selected yet'}
      >
        <SourcePanel
          mode={mode}
          onModeChange={setMode}
          localUrl={localUrl}
          onLocalUrlChange={updateLocalUrl}
          selected={source}
          onSelect={setSource}
          disabled={running}
          progressFile={profile.progressFile}
        />
      </Step>

      <Step
        index="02"
        title="Choose the platform"
        done
        hint={settings.platform === 'adobe' ? 'Adobe Stock' : 'Shutterstock'}
      >
        <div className="grid gap-px sm:grid-cols-2">
          {PLATFORMS.map((platform) => {
            const selected = settings.platform === platform.id

            return (
              <button
                key={platform.id}
                type="button"
                disabled={running}
                aria-pressed={selected}
                onClick={() =>
                  updateSettings({
                    ...settings,
                    platform: platform.id,
                    // Carrying .ai over to Shutterstock writes a CSV it rejects.
                    vectorExtension:
                      platform.id === 'shutterstock' && settings.vectorExtension
                        ? '.eps'
                        : settings.vectorExtension,
                  })
                }
                className="border-(--line) aria-pressed:border-primary aria-pressed:bg-accent/40 hover:bg-accent/20 border p-4 text-left transition-colors disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-medium">
                    {platform.name}
                  </span>
                  {selected ? <Check className="text-primary size-4" /> : null}
                </div>
                <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
                  {platform.detail}
                </p>
                <p className="text-muted-foreground/70 mt-3 font-mono text-[0.65rem]">
                  {platform.file}
                </p>
              </button>
            )
          })}
        </div>

        <AdvancedOptions
          settings={settings}
          onChange={updateSettings}
          disabled={running}
        />
      </Step>

      <Step
        index="03"
        title="Run it"
        done={state.status === 'done'}
        hint={
          activeKeys.length === 0
            ? 'No active keys'
            : `${activeKeys.length} key${activeKeys.length === 1 ? '' : 's'} · ${workersFor(activeKeys.length)} parallel · ${activeKeys.length * 15} req/min`
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              onClick={() => void run()}
              disabled={!ready || running}
              className="eyebrow h-11 px-5"
            >
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {running ? 'Working…' : 'Generate metadata'}
            </Button>

            {running ? (
              <Button variant="outline" size="lg" onClick={cancel} className="h-11">
                <Square className="size-4" />
                Stop
              </Button>
            ) : null}

            {!ready && !running ? (
              <p className="text-muted-foreground font-mono text-xs">
                {activeKeys.length === 0
                  ? 'add a Gemini key first'
                  : 'choose a folder first'}
              </p>
            ) : null}

            {state.status === 'done' && state.csvName ? (
              <span className="flex items-center gap-2 text-sm">
                <Check className="text-primary size-4" />
                <code className="font-mono text-xs">{state.csvName}</code>
                <span className="text-muted-foreground">written to the folder</span>
              </span>
            ) : null}
          </div>

          {state.total > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between font-mono text-xs">
                <span className="text-muted-foreground">
                  {state.done} / {state.total} files
                </span>
                <span className="text-primary tabular-nums">{percent}%</span>
              </div>
              <div className="bg-muted border-(--line) h-2.5 overflow-hidden border">
                <div
                  className="bg-primary exposure h-full transition-[width] duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow text-muted-foreground">Keys in rotation</p>
              <Link
                to="/dashboard/keys"
                className="text-muted-foreground hover:text-foreground eyebrow inline-flex items-center gap-1.5"
              >
                <KeyRound className="size-3" />
                Manage
              </Link>
            </div>
            <KeyRail keys={activeKeys} live={state.keys} />
            <p className="text-muted-foreground text-xs text-pretty">
              Each key runs its own worker at ~15 requests a minute. A key that
              hits a 429 cools down for 60 seconds while the others keep going;
              one that runs out for the day is dropped and a reserve takes over.
            </p>
          </div>

          <RunLog lines={state.logs} />
        </div>
      </Step>

      {state.rows.length > 0 ? (
        <ResultTable rows={state.rows} platform={settings.platform} />
      ) : null}
    </div>
  )
}

/**
 * One numbered step. The state is carried by the number itself — filled when
 * the step is satisfied — so the page answers "what do I do next" at a glance
 * instead of presenting three equal cards.
 */
function Step({
  index,
  title,
  hint,
  done,
  children,
}: {
  index: string
  title: string
  hint?: string
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="border-(--line) border">
      <header className="border-(--line) flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-4 py-3">
        <span
          data-done={done ? '' : undefined}
          className="border-(--line) text-muted-foreground data-done:border-primary data-done:bg-primary data-done:text-primary-foreground flex size-6 shrink-0 items-center justify-center border font-mono text-[0.65rem]"
        >
          {index}
        </span>
        <h2 className="font-display text-lg font-medium">{title}</h2>
        {hint ? (
          <span className="text-muted-foreground ml-auto truncate font-mono text-xs">
            {hint}
          </span>
        ) : null}
      </header>

      <div className="p-4">{children}</div>
    </section>
  )
}
