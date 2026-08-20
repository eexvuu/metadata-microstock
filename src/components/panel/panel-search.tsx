import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PanelIcon } from '#/components/panel/panel-icon'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog'
import { SEARCH_MIN } from '#/lib/panel/search'
import type { PanelSearchGroup } from '#/lib/panel/types'
import { searchPanel } from '#/lib/server/panel'
import { cn } from '#/lib/utils'

/**
 * Global search — Filament's ⌘K palette.
 *
 * One request searches every resource this user may view, and the results are
 * grouped by resource on the way back. Picking one navigates to that list with
 * `?edit=<id>`, which opens the record straight away however deep it is in the
 * table.
 *
 * Built on the Dialog this kit already ships rather than on `cmdk`: the whole
 * behaviour is a filtered list and two arrow keys, and the Worker has a size
 * limit worth spending elsewhere.
 */
export function PanelSearch() {
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [groups, setGroups] = useState<PanelSearchGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [meta, setMeta] = useState(false)

  /** Rendered after mount only — the server has no idea which OS this is. */
  useEffect(() => {
    setMeta(navigator.platform.toLowerCase().includes('mac'))
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** Every open starts blank. A palette that remembers is a palette in the way. */
  useEffect(() => {
    if (open) return

    setTerm('')
    setGroups([])
    setActive(0)
  }, [open])

  useEffect(() => {
    const query = term.trim()

    if (query.length < SEARCH_MIN) {
      setGroups([])
      setLoading(false)
      return
    }

    setLoading(true)
    let cancelled = false

    /** One query per resource per keystroke would be a lot of D1 row reads. */
    const timer = setTimeout(() => {
      searchPanel({ data: { q: query } })
        .then((next) => {
          if (cancelled) return
          setGroups(next)
          setActive(0)
        })
        .catch(() => !cancelled && setGroups([]))
        .finally(() => !cancelled && setLoading(false))
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])

  /** Arrow keys move through hits, not through groups. */
  const flat = groups.flatMap((group) =>
    group.hits.map((hit) => ({
      resource: group.resource,
      id: hit.id,
      editable: group.editable,
    })),
  )

  const offsets: number[] = []
  let running = 0
  for (const group of groups) {
    offsets.push(running)
    running += group.hits.length
  }

  function go(index: number) {
    const target = flat[index]
    if (!target) return

    setOpen(false)
    void navigate({
      to: '/dashboard/$resource',
      params: { resource: target.resource },
      /**
       * A hit you cannot edit still has somewhere to go: its own list, carrying
       * the term you typed. That term matched this row through the resource's
       * own searchable columns, so the row is guaranteed to be there — which
       * the record's title is not, when the title column is not one of them.
       */
      search: target.editable
        ? { page: 1, edit: target.id }
        : { page: 1, q: term.trim() },
    })
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((prev) => (flat.length === 0 ? 0 : (prev + 1) % flat.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((prev) =>
        flat.length === 0 ? 0 : (prev - 1 + flat.length) % flat.length,
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(active)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground border-(--line) hover:border-(--line-strong) w-full justify-start border font-normal"
      >
        <Search className="size-4" />
        Search
        <kbd className="border-(--line) text-muted-foreground ml-auto border px-1 font-mono text-[0.6rem]">
          {meta ? '⌘' : 'Ctrl '}K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-24 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search this workspace</DialogTitle>
          <DialogDescription className="sr-only">
            Search across every panel your role can open.
          </DialogDescription>

          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search projects, members, billing…"
              aria-label="Search this workspace"
              className="placeholder:text-muted-foreground h-11 w-full bg-transparent text-sm outline-none"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {term.trim().length < SEARCH_MIN ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                Type at least {SEARCH_MIN} characters.
              </p>
            ) : loading ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                Searching…
              </p>
            ) : flat.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                Nothing matches “{term.trim()}”.
              </p>
            ) : (
              groups.map((group, groupIndex) => (
                <div key={group.resource} className="mb-1 last:mb-0">
                  <p className="eyebrow text-muted-foreground/70 px-2.5 py-2">
                    {group.label}
                  </p>

                  {group.hits.map((hit, hitIndex) => {
                    const index = offsets[groupIndex]! + hitIndex
                    const current = index === active

                    return (
                      <button
                        key={hit.id}
                        type="button"
                        ref={(node) => {
                          /** Keep the arrow-key selection inside the scroller. */
                          if (current) node?.scrollIntoView({ block: 'nearest' })
                        }}
                        onClick={() => go(index)}
                        onMouseMove={() => setActive(index)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm',
                          current && 'bg-accent text-accent-foreground',
                        )}
                      >
                        <PanelIcon
                          name={group.icon}
                          className="text-muted-foreground size-4 shrink-0"
                        />
                        <span className="truncate">{hit.title}</span>
                        {hit.detail ? (
                          <span className="text-muted-foreground ml-auto truncate pl-3 text-xs">
                            {hit.detail}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
