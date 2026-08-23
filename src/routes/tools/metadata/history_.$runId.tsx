import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ReviewEditor } from '#/components/generator/review-editor'
import { PageHead } from '#/components/page-head'
import { Button } from '#/components/ui/button'
import { csvTextFor } from '#/lib/engine/runner'
import { adobeProfile } from '#/lib/engine/profiles/adobe'
import { shutterstockProfile } from '#/lib/engine/profiles/shutterstock'
import type { MetadataRow, RunOptions } from '#/lib/engine/types'
import { loadThumbnails } from '#/lib/generator/thumbnails'
import { useMessages } from '#/lib/i18n'
import { getRunRows, updateRunRows } from '#/lib/server/runs'

/**
 * A finished run, reopened.
 *
 * The same editor the tool shows after a run, with one thing missing and one
 * added. Missing: the folder — the files are on the contributor's own disk and
 * this page never had a handle to them, which is why `source` is null and the
 * CSV is built without one. Added: a Save, since these edits have to survive
 * the tab.
 *
 * The pictures come from IndexedDB rather than from us. That is the whole
 * point — see `src/lib/generator/thumbnails.ts` — and it means a run reopened
 * on a different machine shows the rows without the tiles.
 */
/**
 * The trailing underscore on the filename matters. Without it, TanStack's flat
 * routes make `history.tsx` a LAYOUT for this route, and opening a result
 * renders the history list again at the new URL — which is exactly what it did
 * before the rename. `history_.$runId` is a sibling instead.
 */
export const Route = createFileRoute('/tools/metadata/history_/$runId')({
  loader: ({ params }) => getRunRows({ data: { runId: params.runId } }),
  component: SavedResultPage,
})

const PROFILES = {
  adobe: adobeProfile,
  shutterstock: shutterstockProfile,
}

function parseRows(json: string): MetadataRow[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as MetadataRow[]) : []
  } catch {
    return []
  }
}

function SavedResultPage() {
  const m = useMessages()
  const saved = Route.useLoaderData()
  const { runId } = Route.useParams()

  const [rows, setRows] = useState<MetadataRow[]>(() =>
    saved ? parseRows(saved.rows) : [],
  )
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previews, setPreviews] = useState<Record<string, string>>({})

  // Before the early return below, or the hook order changes with the data.
  useEffect(() => {
    let cancelled = false
    const urls: string[] = []

    loadThumbnails(runId)
      .then((blobs) => {
        if (!blobs || cancelled) return
        const next: Record<string, string> = {}
        for (const [name, blob] of Object.entries(blobs)) {
          const url = URL.createObjectURL(blob)
          urls.push(url)
          next[name] = url
        }
        setPreviews(next)
      })
      .catch((error: unknown) => {
        // Private mode, a cleared origin, a browser with IndexedDB off — none
        // of it should cost the contributor their rows.
        console.warn('[stockflow] no stored previews:', error)
      })

    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [runId])

  if (!saved) {
    return (
      <div className="space-y-8">
        <PageHead index={m.history.title} title={m.history.resultGone}>
          {m.history.resultGoneBody}
        </PageHead>
        <Button asChild variant="outline" size="sm">
          <Link to="/tools/metadata/history" className="eyebrow">
            <ArrowLeft className="size-3" />
            {m.history.backToHistory}
          </Link>
        </Button>
      </div>
    )
  }

  const platform = saved.platform
  const days = Math.ceil((saved.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))

  const save = async () => {
    setSaving(true)
    try {
      await updateRunRows({ data: { runId, rows: JSON.stringify(rows) } })
      setDirty(false)
      toast.success(m.history.resultSaved)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : m.history.resultSaveFailed,
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * The download happens in the tab, from text the tab already holds. Nothing
   * about a CSV needs a round trip, and routing it through the server would
   * put someone's metadata on a disk we own for no reason at all.
   */
  const download = () => {
    const options = { platform, vectorExtension: undefined } as RunOptions
    const { csvName, text } = csvTextFor(
      PROFILES[platform],
      rows,
      options,
      saved.folderName,
    )

    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/csv;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = csvName
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/tools/metadata/history"
          className="text-muted-foreground hover:text-foreground eyebrow inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-3" />
          {m.history.title}
        </Link>
      </div>

      <PageHead
        index={m.history.resultTitle}
        title={saved.folderName}
        action={
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? m.history.saving : m.history.save}
          </Button>
        }
      >
        {m.history.expiresIn(days)}
        {Object.keys(previews).length === 0
          ? ` · ${m.history.previewsMissing}`
          : null}
      </PageHead>

      <ReviewEditor
        rows={rows}
        entries={[]}
        source={null}
        previews={previews}
        platform={platform}
        onChange={(next) => {
          setRows(next)
          setDirty(true)
        }}
        onExport={download}
        exporting={false}
        writable={false}
      />
    </div>
  )
}
