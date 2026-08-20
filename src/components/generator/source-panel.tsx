import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, FolderOpen, HardDrive, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  BrowserDirectorySource,
  isSupported,
  pickDirectory,
} from '#/lib/sources/browser-directory'
import {
  LocalServerClient,
  LocalServerSource,
  type BrowseResult,
} from '#/lib/sources/local-server'
import type { FileSource } from '#/lib/sources/types'
import { mp4boxPreprocessor } from '#/lib/video/mp4box-strip'
import { passthroughPreprocessor, type VideoPreprocessor } from '#/lib/video/types'

export type SourceMode = 'browser' | 'local'

export interface SelectedSource {
  mode: SourceMode
  label: string
  create: () => FileSource
  /** Browser mode remuxes with mp4box; local mode gets stripped bytes already. */
  video: VideoPreprocessor
}

interface SourcePanelProps {
  mode: SourceMode
  onModeChange: (mode: SourceMode) => void
  localUrl: string
  onLocalUrlChange: (url: string) => void
  selected: SelectedSource | null
  onSelect: (source: SelectedSource | null) => void
  disabled: boolean
  progressFile: string
}

export function SourcePanel({
  mode,
  onModeChange,
  localUrl,
  onLocalUrlChange,
  selected,
  onSelect,
  disabled,
  progressFile,
}: SourcePanelProps) {
  return (
    <div className="space-y-4">
      <Select
        value={mode}
        disabled={disabled}
        onValueChange={(value) => {
          onSelect(null)
          onModeChange(value as SourceMode)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="browser">
            Browser — pick one folder, works deployed
          </SelectItem>
          <SelectItem value="local">
            Local helper — browse every drive, ffmpeg for all video formats
          </SelectItem>
        </SelectContent>
      </Select>

      {mode === 'browser' ? (
        <BrowserPicker selected={selected} onSelect={onSelect} disabled={disabled} />
      ) : (
        <LocalPicker
          baseUrl={localUrl}
          onBaseUrlChange={onLocalUrlChange}
          selected={selected}
          onSelect={onSelect}
          disabled={disabled}
        />
      )}

      <p className="text-muted-foreground text-xs text-pretty">
        Progress is written to{' '}
        <code className="border-(--line) text-foreground border px-1 py-0.5 font-mono text-[0.7rem]">
          {progressFile}
        </code>{' '}
        after every file, in the folder itself — so an interrupted run resumes
        where it stopped, including one started from the CLI.
      </p>
    </div>
  )
}

function BrowserPicker({
  selected,
  onSelect,
  disabled,
}: Pick<SourcePanelProps, 'selected' | 'onSelect' | 'disabled'>) {
  const [error, setError] = useState<string | null>(null)
  const supported = typeof window !== 'undefined' && isSupported()

  const choose = async () => {
    setError(null)
    try {
      const handle = await pickDirectory()
      if (!handle) return
      onSelect({
        mode: 'browser',
        label: handle.name,
        create: () => new BrowserDirectorySource(handle),
        video: mp4boxPreprocessor,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={choose} disabled={!supported || disabled} variant="outline">
          <FolderOpen className="size-4" />
          {selected ? 'Change folder' : 'Choose folder'}
        </Button>
        {selected ? (
          <span className="border-primary/40 text-primary border-l-2 pl-2 font-mono text-sm">
            {selected.label}
          </span>
        ) : (
          <span className="text-muted-foreground font-mono text-xs">
            no folder selected
          </span>
        )}
      </div>
      {!supported ? (
        <p className="text-destructive text-sm text-pretty">
          This browser has no File System Access API — that is Chrome and Edge
          only. Use local mode, or open the app in Chrome.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs text-pretty">
        MP4, M4V and MOV videos are remuxed in the tab to drop their audio track,
        which Gemma refuses. AVI, MKV, WEBM, WMV and FLV need local mode.
      </p>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  )
}

function LocalPicker({
  baseUrl,
  onBaseUrlChange,
  selected,
  onSelect,
  disabled,
}: {
  baseUrl: string
  onBaseUrlChange: (url: string) => void
  selected: SelectedSource | null
  onSelect: (source: SelectedSource | null) => void
  disabled: boolean
}) {
  const [roots, setRoots] = useState<string[]>([])
  const [listing, setListing] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const client = new LocalServerClient(baseUrl)

  const connect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await new LocalServerClient(baseUrl).roots()
      setRoots(result.roots)
      setListing(await new LocalServerClient(baseUrl).browse(result.home))
    } catch (caught) {
      setError(
        `${caught instanceof Error ? caught.message : String(caught)} — is \`bun run local\` running?`,
      )
      setRoots([])
      setListing(null)
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    void connect()
  }, [connect])

  const open = async (path: string) => {
    setError(null)
    try {
      setListing(await client.browse(path))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const use = (path: string) => {
    onSelect({
      mode: 'local',
      label: path,
      create: () => new LocalServerSource(new LocalServerClient(baseUrl), path),
      // The server already ran `ffmpeg -an -c:v copy` on the way out.
      video: passthroughPreprocessor,
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={baseUrl}
          disabled={disabled}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          className="font-mono text-sm"
        />
        <Button variant="outline" size="icon" onClick={connect} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm text-pretty">{error}</p> : null}

      {roots.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {roots.map((root) => (
            <Button key={root} variant="outline" size="sm" onClick={() => open(root)}>
              <HardDrive className="size-3.5" />
              {root}
            </Button>
          ))}
        </div>
      ) : null}

      {listing ? (
        <div className="border-(--line) border">
          <div className="border-(--line) bg-muted/40 flex items-center justify-between gap-3 border-b px-3 py-2">
            <code className="truncate font-mono text-xs">{listing.path}</code>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-muted-foreground font-mono text-xs">
                {listing.mediaCount} media
              </span>
              <Button
                size="sm"
                disabled={disabled || listing.mediaCount === 0}
                onClick={() => use(listing.path)}
              >
                Use this folder
              </Button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => open(listing.parent)}
              className="hover:bg-accent hover:text-accent-foreground block w-full px-3 py-1.5 text-left font-mono text-xs"
            >
              ..
            </button>
            {listing.directories.map((directory) => (
              <button
                key={directory.path}
                type="button"
                onClick={() => open(directory.path)}
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-1 px-3 py-1.5 text-left font-mono text-xs"
              >
                <ChevronRight className="size-3 shrink-0 opacity-50" />
                {directory.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selected ? (
        <p className="text-sm">
          Selected <code className="font-mono">{selected.label}</code>
        </p>
      ) : null}
    </div>
  )
}
