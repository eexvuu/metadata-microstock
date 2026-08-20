import { useMemo, useState } from 'react'
import { AlertTriangle, Download, Plus, X } from 'lucide-react'

import { MediaThumb } from '#/components/generator/media-thumb'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { ADOBE_CATEGORIES } from '#/lib/engine/profiles/adobe'
import { CATEGORY_NAMES } from '#/lib/engine/shutterstock-categories'
import type { MediaEntry, MetadataRow, RunOptions } from '#/lib/engine/types'
import type { FileSource } from '#/lib/sources/types'

const MAX_KEYWORDS: Record<RunOptions['platform'], number> = {
  adobe: 49,
  shutterstock: 50,
}

/** What a contributor uploading vector art actually needs the CSV to say. */
const EXTENSIONS = ['.eps', '.ai', '.jpg', '.png']

function swapExtension(filename: string, extension: string): string {
  const dot = filename.lastIndexOf('.')
  return (dot > 0 ? filename.slice(0, dot) : filename) + extension
}

/**
 * The review step — the reason the CSV is no longer written the moment the run
 * ends.
 *
 * Everything the model produced is editable here, next to the picture it came
 * from, because the person uploading is the one who knows the shoot. What the
 * platforms will actually reject (a comma in an Adobe title, a 60th keyword) is
 * shown as a warning on the row rather than enforced silently.
 */
export function ReviewEditor({
  rows,
  entries,
  source,
  platform,
  onChange,
  onExport,
  exporting,
  canExport = true,
  writable,
}: {
  rows: MetadataRow[]
  entries: MediaEntry[]
  source: FileSource
  platform: RunOptions['platform']
  onChange: (rows: MetadataRow[]) => void
  onExport: () => void
  exporting: boolean
  /** False while a run is unfinished: a partial CSV is worse than none. */
  canExport?: boolean
  writable: boolean
}) {
  const [query, setQuery] = useState('')
  const [bulkKeyword, setBulkKeyword] = useState('')

  const byName = useMemo(() => {
    const map = new Map<string, MediaEntry>()
    for (const entry of entries) map.set(entry.name, entry)
    return map
  }, [entries])

  const visible = query
    ? rows.filter((row) =>
        `${row.filename} ${row.title} ${row.description ?? ''} ${row.keywords}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : rows

  /** Keyed on the file on disk, because `filename` is one of the fields. */
  const patch = (sourceName: string, changes: Partial<MetadataRow>) =>
    onChange(
      rows.map((row) => (row.sourceName === sourceName ? { ...row, ...changes } : row)),
    )

  /**
   * The vector answer, in one control: analyse the JPEG you exported, then tell
   * the CSV to name the .eps you are actually uploading. Nothing on disk moves.
   */
  const applyExtension = (extension: string) => {
    if (!extension) return
    onChange(
      rows.map((row) => ({ ...row, filename: swapExtension(row.filename, extension) })),
    )
  }

  const addToAll = () => {
    const keyword = bulkKeyword.trim().toLowerCase()
    if (!keyword) return

    onChange(
      rows.map((row) => {
        const list = splitKeywords(row.keywords)
        if (list.includes(keyword)) return row
        return { ...row, keywords: [...list, keyword].join(', ') }
      }),
    )
    setBulkKeyword('')
  }

  const problems = rows.filter((row) => issuesOf(row, platform).length > 0).length

  return (
    <div className="space-y-4">
      <div className="border-(--line) bg-card sticky top-16 z-20 flex flex-wrap items-center gap-3 border p-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl leading-none font-medium tabular-nums">
            {rows.length}
          </span>
          <span className="eyebrow text-muted-foreground">rows ready</span>
        </div>

        {problems > 0 ? (
          <span className="text-primary flex items-center gap-1.5 font-mono text-xs">
            <AlertTriangle className="size-3.5" />
            {problems} need a look
          </span>
        ) : null}

        <Input
          value={query}
          placeholder="Filter rows…"
          onChange={(event) => setQuery(event.target.value)}
          className="w-48"
        />

        <div className="flex items-center gap-1.5">
          <Input
            value={bulkKeyword}
            placeholder="Keyword for every row"
            onChange={(event) => setBulkKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addToAll()
              }
            }}
            className="w-56"
          />
          <Button variant="outline" size="icon" onClick={addToAll} aria-label="Add to all rows">
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Select value="" onValueChange={applyExtension}>
            <SelectTrigger className="w-52" aria-label="Extension for every row">
              <SelectValue placeholder="Extension for all rows…" />
            </SelectTrigger>
            <SelectContent>
              {EXTENSIONS.map((extension) => (
                <SelectItem key={extension} value={extension}>
                  rename every row to {extension}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={onExport}
          disabled={exporting || !canExport || rows.length === 0}
          className="eyebrow ml-auto"
        >
          <Download className="size-4" />
          {writable ? 'Write CSV to folder' : 'Download CSV'}
        </Button>
      </div>

      <div className="space-y-2">
        {visible.map((row) => {
          const entry = byName.get(row.sourceName) ?? byName.get(row.filename)
          const keywords = splitKeywords(row.keywords)
          const issues = issuesOf(row, platform)

          return (
            <article
              key={row.sourceName}
              className="border-(--line) bg-card grid gap-4 border p-3 md:grid-cols-[8rem_1fr]"
            >
              <div className="space-y-1.5">
                {entry ? (
                  <MediaThumb source={source} entry={entry} className="aspect-square" />
                ) : (
                  <div className="border-(--line) bg-muted aspect-square border" />
                )}
                {row.fallback ? (
                  <p className="text-destructive font-mono text-[0.6rem]">
                    {row.fallback} fallback — written by hand or re-run
                  </p>
                ) : null}
              </div>

              <div className="min-w-0 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <Label htmlFor={`file-${row.sourceName}`}>Filename in the CSV</Label>
                    {row.filename !== row.sourceName ? (
                      <span className="text-muted-foreground truncate font-mono text-[0.65rem]">
                        on disk: {row.sourceName}
                      </span>
                    ) : null}
                  </div>
                  <Input
                    id={`file-${row.sourceName}`}
                    value={row.filename}
                    onChange={(event) =>
                      patch(row.sourceName, { filename: event.target.value })
                    }
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={`title-${row.sourceName}`}>
                      {platform === 'adobe' ? 'Title' : 'Description'}
                    </Label>
                    <span className="text-muted-foreground font-mono text-[0.65rem] tabular-nums">
                      {(platform === 'adobe' ? row.title : (row.description ?? ''))
                        .length}{' '}
                      chars
                    </span>
                  </div>
                  <Textarea
                    id={`title-${row.sourceName}`}
                    rows={2}
                    value={platform === 'adobe' ? row.title : (row.description ?? '')}
                    onChange={(event) =>
                      patch(
                        row.sourceName,
                        platform === 'adobe'
                          ? { title: event.target.value }
                          : { description: event.target.value },
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label>Keywords</Label>
                    <span
                      className={`font-mono text-[0.65rem] tabular-nums ${
                        keywords.length > MAX_KEYWORDS[platform]
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {keywords.length} / {MAX_KEYWORDS[platform]}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {keywords.map((keyword, index) => (
                      <button
                        key={`${keyword}-${index}`}
                        type="button"
                        onClick={() =>
                          patch(row.sourceName, {
                            keywords: keywords
                              .filter((_, position) => position !== index)
                              .join(', '),
                          })
                        }
                        className="border-(--line) hover:border-destructive hover:text-destructive group/chip inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[0.65rem] transition-colors"
                      >
                        {keyword}
                        <X className="size-2.5 opacity-40 group-hover/chip:opacity-100" />
                      </button>
                    ))}

                    <KeywordInput
                      onAdd={(keyword) => {
                        if (keywords.includes(keyword)) return
                        patch(row.sourceName, {
                          keywords: [...keywords, keyword].join(', '),
                        })
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1.5">
                    <Label>{platform === 'adobe' ? 'Category' : 'Categories'}</Label>
                    {platform === 'adobe' ? (
                      <Select
                        value={row.category || '1'}
                        onValueChange={(value) =>
                          patch(row.sourceName, { category: value })
                        }
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ADOBE_CATEGORIES.map(([id, label]) => (
                            <SelectItem key={id} value={id}>
                              {id} · {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <Input
                          list="shutterstock-categories"
                          value={row.category}
                          onChange={(event) =>
                            patch(row.sourceName, { category: event.target.value })
                          }
                          className="w-64 font-mono text-xs"
                        />
                        <datalist id="shutterstock-categories">
                          {CATEGORY_NAMES.map((name) => (
                            <option key={name} value={name} />
                          ))}
                        </datalist>
                      </>
                    )}
                  </div>

                  {issues.length > 0 ? (
                    <ul className="text-primary space-y-0.5 font-mono text-[0.65rem]">
                      {issues.map((issue) => (
                        <li key={issue}>· {issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="border-(--line) text-muted-foreground border border-dashed py-8 text-center font-mono text-xs">
          nothing matches that filter
        </p>
      ) : null}
    </div>
  )
}

function KeywordInput({ onAdd }: { onAdd: (keyword: string) => void }) {
  const [value, setValue] = useState('')

  return (
    <input
      value={value}
      placeholder="+ keyword"
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ',') return
        event.preventDefault()
        const keyword = value.trim().toLowerCase()
        if (keyword) onAdd(keyword)
        setValue('')
      }}
      className="text-muted-foreground focus:border-primary focus:text-foreground w-24 border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-[0.65rem] outline-none"
    />
  )
}

function splitKeywords(value: string): string[] {
  return value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}

/** What each platform will actually complain about, checked as you type. */
function issuesOf(row: MetadataRow, platform: RunOptions['platform']): string[] {
  const issues: string[] = []
  const text = platform === 'adobe' ? row.title : (row.description ?? '')
  const keywords = splitKeywords(row.keywords)
  // Shutterstock rejects these outright and Adobe silently mangles them.
  const badFilename = /[\n\r\t/\\]/

  if (!row.filename.trim()) issues.push('no filename')
  if (badFilename.test(row.filename)) {
    issues.push('filename has a slash or a line break')
  }
  if (!text.trim()) issues.push('no title yet')
  if (keywords.length === 0) issues.push('no keywords')
  if (keywords.length > MAX_KEYWORDS[platform]) {
    issues.push(`${keywords.length - MAX_KEYWORDS[platform]} keyword(s) over the limit`)
  }
  if (platform === 'adobe' && /["',]/.test(row.title)) {
    issues.push('Adobe titles cannot contain a comma or quote')
  }
  if (!row.category.trim()) issues.push('no category')

  return issues
}
