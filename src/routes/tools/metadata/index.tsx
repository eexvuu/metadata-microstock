import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Check, KeyRound, Loader2, Play, RotateCcw, Square } from 'lucide-react'
import { toast } from 'sonner'

import { KeyRail } from '#/components/generator/key-rail'
import { AddFirstKey, KeysDialog } from '#/components/generator/keys-dialog'
import { MediaGrid } from '#/components/generator/media-thumb'
import {
  MediaPicker,
  directorySource,
  type SelectedSource,
} from '#/components/generator/media-picker'
import { AdvancedOptions } from '#/components/generator/options-panel'
import { ReviewEditor } from '#/components/generator/review-editor'
import { RunLog } from '#/components/generator/run-log'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
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
  AUTO_WORKERS,
  DEFAULT_SETTINGS,
  LADDER_LABEL,
  MAX_WORKERS,
  clearLegacyKeyStorage,
  keysInPlay,
  loadSettings,
  saveSettings,
  toRunOptions,
  workersFor,
  type StoredSettings,
} from '#/lib/generator/settings'
import {
  clearPendingRun,
  loadPendingRun,
  regrantWrite,
  savePendingRun,
  updatePendingProgress,
  type PendingRun,
} from '#/lib/generator/resume'
import { archiveOriginals } from '#/lib/generator/archive'
import { captureThumbnails, saveThumbnails } from '#/lib/generator/thumbnails'
import { useGenerator } from '#/lib/generator/use-generator'
import { useMessages } from '#/lib/i18n'
import { getDecryptedKeys, markKeysUsed } from '#/lib/server/gemini-keys'
import { checkpointRun, finishRun, saveRunRows, startRun } from '#/lib/server/runs'

export const Route = createFileRoute('/tools/metadata/')({
  component: MetadataTool,
})

/** The tool's shell holds the keys — both of its screens want the same list. */
const shell = getRouteApi('/tools/metadata')

/** The names belong to the platforms; what each wants is translated copy. */
const PLATFORMS = [
  { id: 'adobe' as const, name: 'Adobe Stock', detail: 'adobeDetail' as const },
  {
    id: 'shutterstock' as const,
    name: 'Shutterstock',
    detail: 'shutterstockDetail' as const,
  },
]

/**
 * How many finished files are worth a round trip.
 *
 * Every checkpoint posts the whole result — a 500-file run is around 300 KB —
 * so this is the trade between what a closed tab loses and what a shared box
 * carries. Ten files is a couple of minutes of work at most.
 */
const CHECKPOINT_EVERY = 10

function MetadataTool() {
  const m = useMessages()
  const keys = shell.useLoaderData()
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
  const [pending, setPending] = useState<PendingRun | null>(null)
  const { state, start, cancel, reset } = useGenerator()
  /** Checkpoints are serialised: a slow one must not land after the last. */
  const checkpointChain = useRef<Promise<unknown>>(Promise.resolve())
  const lastCheckpoint = useRef(0)
  /** Set by the resume card so the run starts itself once the scan is in. */
  const autoRun = useRef(false)

  useEffect(() => {
    setSettings(loadSettings())
    clearLegacyKeyStorage()
    void loadPendingRun().then(setPending)
  }, [])

  /*
   * The engine is in this tab, so closing it stops the run. Nothing is lost —
   * the progress file and the checkpoints both survive — but somebody who
   * closed the wrong window deserves to be asked first.
   */
  useEffect(() => {
    if (state.status !== 'running') return

    const guard = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [state.status])

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
  const keysUsed = keysInPlay(settings, activeKeys.length)
  const workersRunning = workersFor(keysUsed, settings.maxWorkers)
  /** A worker without a key of its own has nothing to spend. */
  const workerChoices = Math.min(keysUsed, MAX_WORKERS)
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

  /**
   * Write what is finished so far to the server, one call at a time.
   *
   * This is what makes a closed tab survivable from the History screen's side:
   * the folder already has the progress file, but nothing on the server knew
   * about a run until it ended. A failure here is logged and nothing else —
   * the rows are still in the tab and still in the folder, and a run must not
   * die because a convenience save did.
   */
  const queueCheckpoint = (runId: string, rows: MetadataRow[]) => {
    const snapshot = [...rows]

    checkpointChain.current = checkpointChain.current
      .then(async () => {
        await saveRunRows({ data: { runId, rows: JSON.stringify(snapshot) } })
        await checkpointRun({
          data: {
            id: runId,
            filesDone: snapshot.length,
            fallbacks: snapshot.filter((row) => row.fallback).length,
          },
        })
        await updatePendingProgress(snapshot.length)
      })
      .catch((error: unknown) => {
        console.warn('[stockflow] checkpoint not saved:', error)
      })
  }

  const run = async () => {
    if (!selected) return

    try {
      // Plaintext keys are fetched per run rather than held in component state,
      // so they live no longer than the run that needs them.
      // Slice keys and ids together: `markKeysUsed` must only stamp the keys
      // that actually spent quota, and the two lists are ordered the same way.
      const { keys: plaintext, ids } = await getDecryptedKeys()
      const inPlay = keysInPlay(settings, plaintext.length)
      const spending = plaintext.slice(0, inPlay)
      const spendingIds = ids.slice(0, inPlay)
      const options = { ...toRunOptions(settings, spending.length), deferExport: true }

      /*
       * A folder we already have an unfinished run for keeps that run's history
       * row: continuing is the same piece of work, and two rows for it would
       * make the History screen lie about how many runs a person did.
       */
      const carried =
        pending &&
        pending.folderName === selected.source.folderName &&
        pending.platform === options.platform
          ? pending
          : null

      let runId = ''
      if (carried) {
        // `ok: false` means the row is gone — pruned, or a different account.
        const { ok } = await checkpointRun({
          data: { id: carried.runId, filesTotal: entries.length },
        })
        if (ok) runId = carried.runId
      }
      if (!runId) {
        runId = (
          await startRun({
            data: {
              platform: options.platform,
              model: LADDER_LABEL,
              folderName: selected.source.folderName,
              sourceMode: selected.writable ? 'folder' : 'files',
              filesTotal: entries.length,
            },
          })
        ).id
      }

      /*
       * Only a real folder can be reopened: loose files have no handle, and
       * without one there is nothing to come back to.
       */
      if (selected.directory) {
        await savePendingRun({
          runId,
          folderName: selected.source.folderName,
          platform: options.platform,
          directory: selected.directory,
          filesTotal: entries.length,
          filesDone: carried?.filesDone ?? 0,
        })
        setPending(await loadPendingRun())
      }

      lastCheckpoint.current = 0
      const result = await start(
        selected.source,
        spending,
        options,
        selected.video,
        (rows) => {
          // The first file goes up on its own: a run that dies at file three
          // should still read as `partial` in History rather than as a run
          // that never started.
          const due =
            rows.length === 1 || rows.length - lastCheckpoint.current >= CHECKPOINT_EVERY
          if (!due) return
          lastCheckpoint.current = rows.length
          queueCheckpoint(runId, rows)
        },
      )

      setRows(result?.rows ?? [])
      setExported(null)

      // Anything still in flight has to land before the closing numbers, or a
      // slow checkpoint overwrites them a moment later.
      await checkpointChain.current

      await finishRun({
        data: {
          id: runId,
          filesDone: result?.rows.length ?? 0,
          fallbacks: result?.rows.filter((row) => row.fallback).length ?? 0,
          status: result?.status ?? 'error',
        },
      })
      if (spendingIds.length > 0) await markKeysUsed({ data: { ids: spendingIds } })

      /*
       * A finished run has nothing left to resume — and the CSV step is about
       * to delete the progress file anyway. Anything else keeps its folder, so
       * the card is there on the next visit.
       */
      if (result?.status === 'complete') {
        await clearPendingRun()
        setPending(null)
      } else if (selected.directory) {
        await updatePendingProgress(result?.rows.length ?? 0)
        setPending(await loadPendingRun())
      }

      /**
       * Keep the result so History can reopen it for a month.
       *
       * Its own try/catch on purpose: a run that finished is finished. If the
       * rows are too large to store, or the request fails, the CSV is still
       * right here in the tab and losing it to a failed convenience save would
       * be the worse outcome by far.
       */
      if (result && result.rows.length > 0) {
        try {
          const { expiresAt } = await saveRunRows({
            data: { runId, rows: JSON.stringify(result.rows) },
          })

          /*
           * The pictures for that saved result, kept on this machine and dated
           * to die with the rows. Not awaited: the folder is still open and the
           * review screen is already usable, so decoding a hundred files has no
           * business standing between the run and the person reading it.
           */
          void captureThumbnails(selected.source, entries)
            .then((blobs) => saveThumbnails(runId, expiresAt, blobs))
            .catch((error: unknown) => {
              console.warn('[stockflow] previews not stored:', error)
            })

          /*
           * And the originals themselves, to R2, for the same month the rows
           * get. Not awaited for the same reason the thumbnails are not: the
           * folder is open, the review screen is usable, and an upload nobody
           * is waiting on has no business standing in front of it. Failures
           * are the archive's own problem — see `archive.ts`.
           */
          void archiveOriginals(selected.source, entries, runId).catch(
            (error: unknown) => {
              console.warn('[stockflow] originals not archived:', error)
            },
          )
        } catch (error) {
          toast.warning(
            error instanceof Error ? error.message : String(error),
          )
        }
      }
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
          options: toRunOptions(settings, Math.max(keysUsed, 1)),
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

  /**
   * Back into the folder of a run that did not finish.
   *
   * The permission call has to happen inside this click — a handle restored
   * from IndexedDB comes back revoked, and `requestPermission` is only allowed
   * to answer during a gesture. Everything after it is the ordinary path: the
   * scan finds the progress file, and the run skips what is already in it.
   */
  const resume = async () => {
    if (!pending) return

    if (!(await regrantWrite(pending.directory))) {
      toast.error(m.tool.resumeDenied)
      return
    }

    updateSettings({ ...settings, platform: pending.platform })
    autoRun.current = true
    setSelected(directorySource(pending.directory))
  }

  const forgetPending = async () => {
    await clearPendingRun()
    setPending(null)
  }

  // The second half of `resume`: the scan is asynchronous, so the run can only
  // start once there is something to run on.
  useEffect(() => {
    if (!autoRun.current || scanning || !selected || entries.length === 0) return
    autoRun.current = false
    void run()
    // `run` is deliberately not a dependency: it closes over settings that
    // change every render, and re-running this effect is exactly what must
    // not happen twice.
  }, [selected, entries, scanning])

  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0

  return (
    <>

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
          {/*
            Without a key nothing below this line can run, so the ask goes
            first and spans both columns. It used to sit in the run panel,
            which stacks under the picker on anything narrower than xl — a new
            contributor met "pick a folder" and never scrolled far enough to
            find out what was actually missing.
          */}
          {activeKeys.length === 0 ? (
            <div className="xl:col-span-2">
              <AddFirstKey keys={keys} />
            </div>
          ) : null}

          <div className="space-y-6">
            {pending && !selected ? (
              <section className="border-primary/50 bg-accent/20 space-y-3 border p-4">
                <p className="eyebrow text-primary">{m.tool.resumeTitle}</p>
                <p className="max-w-2xl text-sm text-pretty">
                  {m.tool.resumeBody(
                    pending.folderName,
                    pending.filesDone,
                    pending.filesTotal,
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void resume()} className="eyebrow">
                    <Play className="size-4" />
                    {m.tool.resumeAction}
                  </Button>
                  <Button variant="ghost" onClick={() => void forgetPending()}>
                    {m.tool.resumeDismiss}
                  </Button>
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <p className="eyebrow text-muted-foreground">{m.tool.step1}</p>
              <MediaPicker
                selected={selected}
                // Choosing a folder by hand cancels a resume that never got
                // off the ground: an auto-start left armed would spend quota
                // on a folder nobody pressed Run for.
                onSelect={(next) => {
                  autoRun.current = false
                  setSelected(next)
                }}
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

              {running ? (
                <p className="text-muted-foreground text-xs text-pretty">
                  {m.tool.runningNote}
                </p>
              ) : null}

              {/*
                Said before the button is pressed, not after. The tab uploads a
                copy of every file when the run ends and an admin can open it —
                which is only defensible if the person was told, in the place
                they decide.
              */}
              <p className="text-muted-foreground text-xs text-pretty">
                {m.tool.archiveNote}
              </p>

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
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow text-muted-foreground">
                    {m.tool.keysInRotation}
                  </p>
                  {/*
                    A bare text link here read as a caption, and people with a
                    working key could not find the way back to add a second
                    one. It is a button now, because that is what it does.
                  */}
                  {activeKeys.length > 0 ? (
                    <KeysDialog keys={keys}>
                      <Button variant="outline" size="xs" className="eyebrow">
                        <KeyRound className="size-3.5" />
                        {m.tool.manage}
                      </Button>
                    </KeysDialog>
                  ) : null}
                </div>

                {activeKeys.length === 0 ? (
                  <p className="border-(--line) text-muted-foreground border border-dashed px-3 py-4 text-center font-mono text-xs">
                    {m.keys.railEmpty}
                  </p>
                ) : (
                  <>
                    {/*
                      Every key is a separate daily quota, and a contributor
                      often wants one run to leave some of it alone. All of them
                      is the default because that is the fast answer; holding
                      keys back is the deliberate one.
                    */}
                    <div className="flex items-center gap-3">
                      <Label
                        htmlFor="keys-at-once"
                        className="text-muted-foreground shrink-0"
                      >
                        {m.tool.keysUsed}
                      </Label>
                      <Select
                        // A stored count can outlive the keys it was chosen
                        // for. The run already falls back to all of them; show
                        // that rather than an empty box.
                        value={String(
                          settings.maxKeys > activeKeys.length ? 0 : settings.maxKeys,
                        )}
                        disabled={running}
                        onValueChange={(value) =>
                          updateSettings({ ...settings, maxKeys: Number(value) })
                        }
                      >
                        <SelectTrigger id="keys-at-once" className="h-8 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">
                            {m.tool.keysAll(activeKeys.length)}
                          </SelectItem>
                          {Array.from(
                            { length: activeKeys.length },
                            (_, index) => index + 1,
                          ).map((count) => (
                            <SelectItem key={count} value={String(count)}>
                              {m.tool.keysExactly(count)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/*
                      One worker per key is the shape of the thing — the rail
                      above only shows rotation because of it — but eight was a
                      default pretending to be a rule. Thirty keys and a folder
                      of JPEGs is a real case, so the number is chooseable up to
                      the keys in play.
                    */}
                    <div className="flex items-center gap-3">
                      <Label
                        htmlFor="workers-at-once"
                        className="text-muted-foreground shrink-0"
                      >
                        {m.tool.workersUsed}
                      </Label>
                      <Select
                        // Show what the run will actually do, not what is
                        // stored: asking for twenty with ten keys runs ten,
                        // and `min` keeps the 0 sentinel meaning auto. Raise
                        // the key count again and the stored number comes back.
                        value={String(Math.min(settings.maxWorkers, workerChoices))}
                        disabled={running}
                        onValueChange={(value) =>
                          updateSettings({ ...settings, maxWorkers: Number(value) })
                        }
                      >
                        <SelectTrigger id="workers-at-once" className="h-8 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">
                            {m.tool.workersAuto(workersFor(keysUsed))}
                          </SelectItem>
                          {Array.from(
                            { length: workerChoices },
                            (_, index) => index + 1,
                          ).map((count) => (
                            <SelectItem key={count} value={String(count)}>
                              {m.tool.workersExactly(count)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <KeyRail
                      keys={activeKeys.slice(0, keysUsed)}
                      live={state.keys}
                    />
                    <p className="text-muted-foreground text-xs text-pretty">
                      {m.tool.keySummary(keysUsed, workersRunning)}
                      {' · '}
                      {m.tool.rotationNote}
                    </p>
                    {workersRunning > AUTO_WORKERS ? (
                      <p className="text-primary font-mono text-xs text-pretty">
                        {m.tool.workersNote}
                      </p>
                    ) : null}
                    {keysUsed < activeKeys.length ? (
                      <p className="text-primary font-mono text-xs text-pretty">
                        {m.tool.keysHeldBack(activeKeys.length - keysUsed)}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
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
