import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, Check, KeyRound, Loader2, Play, RotateCcw, Square } from 'lucide-react'
import { toast } from 'sonner'

import { KeyRail } from '#/components/generator/key-rail'
import { MediaGrid } from '#/components/generator/media-thumb'
import {
  MediaPicker,
  type SelectedSource,
} from '#/components/generator/media-picker'
import { AdvancedOptions } from '#/components/generator/options-panel'
import { ReviewEditor } from '#/components/generator/review-editor'
import { RunLog } from '#/components/generator/run-log'
import { Button } from '#/components/ui/button'
import { SUPPORTED_EXTENSIONS, extname } from '#/lib/engine/media'
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
import { getDecryptedKeys, listGeminiKeys, markKeysUsed } from '#/lib/server/gemini-keys'
import { finishRun, startRun } from '#/lib/server/runs'

export const Route = createFileRoute('/tools/metadata')({
  loader: () => listGeminiKeys(),
  component: MetadataTool,
})

const PLATFORMS = [
  {
    id: 'adobe' as const,
    name: 'Adobe Stock',
    detail: 'Title, 49 keywords, one category number.',
  },
  {
    id: 'shutterstock' as const,
    name: 'Shutterstock',
    detail: 'Description, 49 keywords, up to two category names.',
  },
]

function MetadataTool() {
  const keys = Route.useLoaderData()
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS)
  const [selected, setSelected] = useState<SelectedSource | null>(null)
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [skipped, setSkipped] = useState(0)
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
      setSkipped(0)
      return
    }

    let cancelled = false
    setScanning(true)

    Promise.all([selected.source.listMedia(), selected.source.listAllNames()])
      .then(([media, names]) => {
        if (cancelled) return
        setEntries(media)
        // Anything that looks like media but never made the queue: AVI, MKV and
        // friends, which cannot have their audio stripped in a tab.
        setSkipped(
          names.filter((name) => SUPPORTED_EXTENSIONS.includes(extname(name)))
            .length - media.length,
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
  const reviewing = rows.length > 0 && !running
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
          ? `${csvName} written next to your media`
          : `${csvName} downloaded`,
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
          Tools
        </Link>

        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl leading-none font-medium tracking-tight">
            Metadata
          </h1>
          <span className="border-primary/40 text-primary border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase">
            free
          </span>
        </div>

        <div className="text-muted-foreground ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
          <span>
            {activeKeys.length} key{activeKeys.length === 1 ? '' : 's'} ·{' '}
            {workersFor(activeKeys.length)} parallel
          </span>
          <Link
            to="/dashboard/keys"
            className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <KeyRound className="size-3" />
            Manage
          </Link>
        </div>
      </header>

      {reviewing ? (
        <>
          <div className="border-(--line) flex flex-wrap items-center gap-4 border p-4">
            <div>
              <p className="eyebrow text-primary">
                {partial ? 'Step 3 · Unfinished' : 'Step 3 · Review'}
              </p>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
                {partial
                  ? `${rows.length} of ${entries.length} files got through before the keys ran out. Run it again — it picks up where it stopped — and the CSV is written once every file is done.`
                  : exported
                    ? `${exported} is done. Edit and export again if you change your mind.`
                    : 'Nothing has been written yet. Fix anything that looks wrong, then export.'}
              </p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              {partial ? (
                <Button onClick={() => void run()} className="eyebrow">
                  <Play className="size-4" />
                  Continue the run
                </Button>
              ) : null}
              <Button variant="outline" onClick={startOver}>
                <RotateCcw className="size-4" />
                Start over
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
              <p className="eyebrow text-muted-foreground">Step 1 · Your media</p>
              <MediaPicker
                selected={selected}
                onSelect={setSelected}
                disabled={running}
              />

              {scanning ? (
                <p className="text-muted-foreground font-mono text-xs">
                  reading the folder…
                </p>
              ) : null}

              {entries.length > 0 ? (
                <>
                  <p className="text-muted-foreground font-mono text-xs">
                    {entries.length} file{entries.length === 1 ? '' : 's'} ·{' '}
                    {entries.filter((entry) => entry.kind === 'image').length} images ·{' '}
                    {entries.filter((entry) => entry.kind === 'video').length} videos
                    {skipped > 0
                      ? ` · ${skipped} skipped (AVI, MKV and WEBM cannot be read here — MP4, MOV and M4V can)`
                      : ''}
                  </p>
                  <MediaGrid source={selected!.source} entries={entries} />
                </>
              ) : null}

              {selected && !scanning && entries.length === 0 ? (
                <p className="text-destructive text-sm text-pretty">
                  No images or videos in there. JPG, PNG, WEBP, SVG, MP4, MOV
                  and M4V are the ones this tool can read.
                </p>
              ) : null}
            </section>

            {state.logs.length > 0 ? <RunLog lines={state.logs} /> : null}
          </div>

          <div className="space-y-6">
            <section className="space-y-3">
              <p className="eyebrow text-muted-foreground">Step 2 · Where you upload</p>

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
                        {platform.detail}
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
              <p className="eyebrow text-muted-foreground">Step 3 · Run it</p>

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
                  {running ? 'Working…' : 'Write my metadata'}
                </Button>

                {running ? (
                  <Button variant="outline" size="lg" onClick={cancel} className="h-11">
                    <Square className="size-4" />
                    Stop
                  </Button>
                ) : null}
              </div>

              {!ready && !running ? (
                <p className="text-muted-foreground font-mono text-xs">
                  {activeKeys.length === 0
                    ? 'add a Gemini key first — it takes a minute and it is free'
                    : 'drop some photos above to start'}
                </p>
              ) : null}

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
                <p className="eyebrow text-muted-foreground">Keys in rotation</p>
                <KeyRail keys={activeKeys} live={state.keys} />
                <p className="text-muted-foreground text-xs text-pretty">
                  Each key works at ~15 requests a minute. One that hits a limit
                  cools down while the others carry on, so more keys is simply
                  faster.
                </p>
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
