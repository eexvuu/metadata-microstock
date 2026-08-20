import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, Check, KeyRound, Loader2, Play, RotateCcw, Square } from 'lucide-react'
import { toast } from 'sonner'

import { KeyRail } from '#/components/generator/key-rail'
import { AddFirstKey, KeysDialog } from '#/components/generator/keys-dialog'
import { MediaGrid } from '#/components/generator/media-thumb'
import {
  MediaPicker,
  type SelectedSource,
} from '#/components/generator/media-picker'
import { AdvancedOptions } from '#/components/generator/options-panel'
import { ReviewEditor } from '#/components/generator/review-editor'
import { RunLog } from '#/components/generator/run-log'
import { Button } from '#/components/ui/button'
import {
  SUPPORTED_EXTENSIONS,
  UNSUPPORTED_MEDIA_EXTENSIONS,
  extname,
} from '#/lib/engine/media'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import { shutterstockProfile } from '#/lib/engine/profiles/shutterstock'
import { exportRun } from '#/lib/engine/runner'
import type { MediaEntry, MetadataRow } from '#/lib/engine/types'
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
import { useMessages } from '#/lib/i18n'
import { getDecryptedKeys, listGeminiKeys, markKeysUsed } from '#/lib/server/gemini-keys'
import { finishRun, startRun } from '#/lib/server/runs'

export const Route = createFileRoute('/tools/metadata')({
  loader: () => listGeminiKeys(),
  component: MetadataTool,
})

/** The names belong to the platforms; what each wants is translated copy. */
const PLATFORMS = [
  { id: 'adobe' as const, name: 'Adobe Stock', detail: 'adobeDetail' as const },
  {
    id: 'shutterstock' as const,
    name: 'Shutterstock',
    detail: 'shutterstockDetail' as const,
  },
]

function MetadataTool() {
  const m = useMessages()
  const keys = Route.useLoaderData()
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS)
  const [selected, setSelected] = useState<SelectedSource | null>(null)
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  /** Files with a supported extension that the source still refused. */
  const [unreadable, setUnreadable] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const [rows, setRows] = useState<MetadataRow[]>([])
  const [exported, setExported] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const { state, start, cancel, reset } = useGenerator()

  useEffect(() => {
    setSettings(loadSettings())
    clearLegacyKeyStorage()
  }, [])

  // Scanning as soon as something is dropped is what makes the tool feel like
  // it understood you: the grid appears before you reach for the Run button.
  useEffect(() => {
    if (!selected) {
      setEntries([])
      setSkipped([])
      setUnreadable([])
      return
    }

    let cancelled = false
    setScanning(true)

    Promise.all([selected.source.listMedia(), selected.source.listAllNames()])
      .then(([media, names]) => {
        if (cancelled) return
        setEntries(media)
        // Say what was left behind. Only formats someone would reasonably
        // expect to work — a stray .csv or the progress file is not news.
        setSkipped([
          ...new Set(
            names
              .map((name) => extname(name))
              .filter((extension) =>
                UNSUPPORTED_MEDIA_EXTENSIONS.includes(extension),
              ),
          ),
        ])

        // A format we do support that still would not open — in practice an
        // .ai saved without PDF compatibility.
        const kept = new Set(media.map((entry) => entry.name))
        setUnreadable(
          names.filter(
            (name) =>
              !kept.has(name) && SUPPORTED_EXTENSIONS.includes(extname(name)),
          ),
        )
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!cancelled) setScanning(false)
      })

    return () => {
      cancelled = true
    }
  }, [selected])

  const activeKeys = keys.filter((key) => key.status === 'active')
  const running = state.status === 'running'
  const profile = settings.platform === 'adobe' ? adobeProfile : shutterstockProfile
  // `selected` guards the render: clearing the drop empties it one render
  // before the effect empties `entries`, and a null source crashes the grid.
  const reviewing = Boolean(selected) && rows.length > 0 && !running
  /*
   * A half-finished run keeps its progress file and writes no CSV — the CLI
   * rule, and the reason "Continue" replaces "Export" here rather than handing
   * out a CSV that is missing rows the upload queue expects.
   */
  const partial = state.status === 'partial'
  const ready = entries.length > 0 && activeKeys.length > 0

  const updateSettings = (next: StoredSettings) => {
    setSettings(next)
    saveSettings(next)
  }

  const run = async () => {
    if (!selected) return

    try {
      // Plaintext keys are fetched per run rather than held in component state,
      // so they live no longer than the run that needs them.
      const { keys: plaintext, ids } = await getDecryptedKeys()
      const options = { ...toRunOptions(settings, plaintext.length), deferExport: true }

      const { id: runId } = await startRun({
        data: {
          platform: options.platform,
          model: options.model,
          folderName: selected.source.folderName,
          sourceMode: selected.writable ? 'folder' : 'files',
          filesTotal: entries.length,
        },
      })

      const result = await start(selected.source, plaintext, options, selected.video)

      setRows(result?.rows ?? [])
      setExported(null)

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

  const exportCsv = async () => {
    if (!selected) return
    setExporting(true)

    try {
      const { csvName, text } = await exportRun(
        {
          source: selected.source,
          profile,
          options: toRunOptions(settings, Math.max(activeKeys.length, 1)),
          emit: () => {},
          media: entries,
        },
        rows,
      )

      if (!selected.writable) download(csvName, text)

      setExported(csvName)
      toast.success(
        selected.writable
          ? m.tool.csvWritten(csvName)
          : m.tool.csvDownloaded(csvName),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setExporting(false)
    }
  }

  const startOver = () => {
    setRows([])
    setExported(null)
    reset()
    // A finished run may have renamed bracketed files, so the cached entries
    // are stale. New object identity = the scan effect runs again.
    if (selected) setSelected({ ...selected })
  }

  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0

  return (
    <div className="space-y-6">
      <header className="border-(--line) flex flex-wrap items-center gap-x-6 gap-y-3 border-b pb-4">
        <Link
          to="/dashboard"
          className="text-muted-foreground hover:text-foreground eyebrow inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-3" />
          {m.nav.tools}
        </Link>

        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl leading-none font-medium tracking-tight">
            {m.nav.metadata}
          </h1>
          <span className="border-primary/40 text-primary border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase">
            {m.catalog.free}
          </span>
        </div>

        <div className="text-muted-foreground ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
          <span>
            {m.tool.keySummary(
              activeKeys.length,
              workersFor(activeKeys.length),
            )}
          </span>
          <KeysDialog keys={keys}>
            <button
              type="button"
              className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <KeyRound className="size-3" />
              {m.tool.keysButton}
            </button>
          </KeysDialog>
        </div>
      </header>

      {reviewing ? (
        <>
          <div className="border-(--line) flex flex-wrap items-center gap-4 border p-4">
            <div>
              <p className="eyebrow text-primary">
                {partial ? m.tool.stepUnfinished : m.tool.stepReview}
              </p>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
                {partial
                  ? m.tool.partialNote(rows.length, entries.length)
                  : exported
                    ? m.tool.exportedNote(exported)
                    : m.tool.reviewNote}
              </p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              {partial ? (
                <Button onClick={() => void run()} className="eyebrow">
                  <Play className="size-4" />
                  {m.tool.continueRun}
                </Button>
              ) : null}
              <Button variant="outline" onClick={startOver}>
                <RotateCcw className="size-4" />
                {m.tool.startOver}
              </Button>
            </div>
          </div>

          <ReviewEditor
            rows={rows}
            entries={entries}
            source={selected!.source}
            platform={settings.platform}
            onChange={setRows}
            onExport={() => void exportCsv()}
            exporting={exporting}
            canExport={!partial}
            writable={selected!.writable}
          />
        </>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <section className="space-y-3">
              <p className="eyebrow text-muted-foreground">{m.tool.step1}</p>
              <MediaPicker
                selected={selected}
                onSelect={setSelected}
                disabled={running}
              />

              {scanning ? (
                <p className="text-muted-foreground font-mono text-xs">
                  {m.tool.scanning}
                </p>
              ) : null}

              {selected && entries.length > 0 ? (
                <>
                  <p className="text-muted-foreground font-mono text-xs">
                    {m.tool.counts(
                      entries.length,
                      entries.filter((entry) => entry.kind === 'image').length,
                      entries.filter((entry) => entry.kind === 'video').length,
                    )}
                  </p>
                  <MediaGrid source={selected.source} entries={entries} />
                </>
              ) : null}

              {/*
                Both notices sit outside the grid on purpose: the interesting
                case is a drop where nothing survived, and that is exactly when
                the reason matters most.
              */}
              {selected && !scanning && unreadable.length > 0 ? (
                <p className="text-destructive font-mono text-xs text-pretty">
                  {m.tool.unreadable(unreadable.join(', '))}
                </p>
              ) : null}

              {selected && !scanning && skipped.length > 0 ? (
                <p className="text-primary font-mono text-xs text-pretty">
                  {m.tool.skipped(skipped.join(', '), skipped[0] ?? '.eps')}
                </p>
              ) : null}

              {selected && !scanning && entries.length === 0 ? (
                <p className="text-muted-foreground text-sm text-pretty">
                  {m.tool.nothingReadable}
                </p>
              ) : null}
            </section>

            {state.logs.length > 0 ? <RunLog lines={state.logs} /> : null}
          </div>

          <div className="space-y-6">
            <section className="space-y-3">
              <p className="eyebrow text-muted-foreground">{m.tool.step2}</p>

              <div className="grid gap-px sm:grid-cols-2">
                {PLATFORMS.map((platform) => {
                  const active = settings.platform === platform.id

                  return (
                    <button
                      key={platform.id}
                      type="button"
                      disabled={running}
                      aria-pressed={active}
                      onClick={() =>
                        updateSettings({ ...settings, platform: platform.id })
                      }
                      className="border-(--line) aria-pressed:border-primary aria-pressed:bg-accent/40 hover:bg-accent/20 border p-3 text-left transition-colors disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-base font-medium">
                          {platform.name}
                        </span>
                        {active ? <Check className="text-primary size-4" /> : null}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs text-pretty">
                        {m.tool[platform.detail]}
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
            </section>

            <section className="border-(--line) space-y-4 border p-4">
              <p className="eyebrow text-muted-foreground">{m.tool.step3}</p>

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
                  {running ? m.tool.working : m.tool.writeMetadata}
                </Button>

                {running ? (
                  <Button variant="outline" size="lg" onClick={cancel} className="h-11">
                    <Square className="size-4" />
                    {m.tool.stop}
                  </Button>
                ) : null}
              </div>

              {!ready && !running ? (
                <p className="text-muted-foreground font-mono text-xs">
                  {activeKeys.length === 0
                    ? m.tool.needKeyFirst
                    : m.tool.needMediaFirst}
                </p>
              ) : null}

              {state.total > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between font-mono text-xs">
                    <span className="text-muted-foreground">
                      {m.tool.progress(state.done, state.total)}
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
                  <p className="eyebrow text-muted-foreground">
                    {m.tool.keysInRotation}
                  </p>
                  {activeKeys.length > 0 ? (
                    <KeysDialog keys={keys}>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground eyebrow transition-colors"
                      >
                        {m.tool.manage}
                      </button>
                    </KeysDialog>
                  ) : null}
                </div>

                {activeKeys.length === 0 ? (
                  <AddFirstKey keys={keys} />
                ) : (
                  <>
                    <KeyRail keys={activeKeys} live={state.keys} />
                    <p className="text-muted-foreground text-xs text-pretty">
                      {m.tool.rotationNote}
                    </p>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

/** No file-system access for a dropped selection, so the CSV goes out as a download. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
