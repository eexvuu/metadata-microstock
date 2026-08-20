import { useRouter } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PanelIcon } from '#/components/panel/panel-icon'
import { ResourceFormDialog, message } from '#/components/panel/resource-form'
import { ResourceTable, recordTitle } from '#/components/panel/resource-table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { FILTER_ALL } from '#/lib/panel/search'
import type { PanelSearch } from '#/lib/panel/search'
import type {
  PanelCustomAction,
  PanelListResult,
  PanelRecord,
} from '#/lib/panel/types'
import {
  deleteResource,
  getResourceRecord,
  runResourceAction,
} from '#/lib/server/panel'

/** What the confirmation dialog is currently asking about. */
type Pending = {
  /** null = the built-in delete. */
  action: PanelCustomAction | null
  ids: string[]
  label: string
}

/**
 * One screen, every resource.
 *
 * Everything on this page — the toolbar, which columns sort, what the dialog
 * asks for, which custom actions exist, whether the delete button is there at
 * all — comes from the meta the server sent. Adding a resource adds no code
 * here.
 */
export function ResourceScreen({
  result,
  search,
  onSearch,
}: {
  result: PanelListResult
  search: PanelSearch
  /** Merges a patch into the URL. Page resets unless the patch sets one. */
  onSearch: (
    patch: Partial<PanelSearch>,
    options?: { replace?: boolean },
  ) => void
}) {
  const router = useRouter()
  const { meta, items, total, page, pageCount, pageSize } = result

  const sort = search.sort ?? meta.defaultSort.column
  const dir = search.dir ?? meta.defaultSort.dir
  const filters = search.filters ?? {}
  const filtered = Boolean(search.q) || Object.keys(filters).length > 0
  const bulkActions = meta.rowActions.filter((action) => action.on.bulk)

  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [running, setRunning] = useState(false)
  /** A record named by `?edit=` that is not on the page in front of us. */
  const [fetched, setFetched] = useState<PanelRecord | null>(null)

  /** A read-only resource, or a role that may look but not touch. */
  const canEdit =
    meta.can.update && meta.fields.some((field) => field.on.update)

  const onPage =
    search.edit && canEdit
      ? (items.find((item) => item.id === search.edit) ?? null)
      : null
  const editing = onPage ?? (fetched?.id === search.edit ? fetched : null)

  /** A new page or a new filter invalidates whatever was ticked. */
  useEffect(() => setSelected([]), [items])

  /**
   * `?edit=` names a row that is usually already on screen — clicking Edit
   * just writes the id to the URL, and nothing is fetched. A global-search hit
   * is the other case: it lands on page 1 of the default sort, where the
   * record it names may be nowhere in sight. Only that case pays for a fetch.
   */
  useEffect(() => {
    const id = search.edit

    if (!id) return

    /** `?edit=` on a screen with nothing to edit is just a stale URL. */
    if (!canEdit) {
      onSearch({ edit: undefined, page }, { replace: true })
      return
    }

    if (onPage) return

    let cancelled = false

    getResourceRecord({ data: { resource: meta.name, id } })
      .then((found) => {
        if (cancelled) return

        if (found) {
          setFetched(found)
        } else {
          toast.error('That record no longer exists.')
          onSearch({ edit: undefined, page }, { replace: true })
        }
      })
      .catch((error) => !cancelled && toast.error(message(error)))

    return () => {
      cancelled = true
    }
  }, [search.edit, onPage, canEdit]) // eslint-disable-line -- the id is the trigger

  /** Typing shouldn't hit D1 on every keystroke. */
  const [term, setTerm] = useState(search.q ?? '')
  useEffect(() => setTerm(search.q ?? ''), [search.q])
  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.q ?? '') !== term) onSearch({ q: term || undefined })
    }, 300)

    return () => clearTimeout(id)
  }, [term]) // eslint-disable-line -- debounce the term, nothing else

  function setEditing(id: string | undefined) {
    /** Passing `page` keeps you on it — opening a dialog is not a new query. */
    onSearch({ edit: id, page }, { replace: true })
  }

  function toggleSort(column: string) {
    const kind = meta.columns.find((candidate) => candidate.name === column)?.kind
    const first = kind === 'date' || kind === 'datetime' || kind === 'number'

    onSearch(
      sort === column
        ? { sort: column, dir: dir === 'asc' ? 'desc' : 'asc' }
        : { sort: column, dir: first ? 'desc' : 'asc' },
    )
  }

  /** "Delete 1 projects?" reads like a bug even when it isn't. */
  function selectionLabel() {
    if (selected.length !== 1) {
      return `${selected.length} ${meta.pluralLabel.toLowerCase()}`
    }

    const found = items.find((item) => item.id === selected[0])

    return found ? recordTitle(meta, found) : meta.label.toLowerCase()
  }

  function setFilter(name: string, value: string) {
    const next = { ...filters }
    if (value === FILTER_ALL) delete next[name]
    else next[name] = value

    onSearch({ filters: Object.keys(next).length > 0 ? next : undefined })
  }

  /** An action with `confirm` asks first; one without just runs. */
  function start(next: Pending) {
    if (next.action && !next.action.confirm) {
      void run(next)
      return
    }

    setPending(next)
  }

  async function run(target: Pending) {
    setRunning(true)

    try {
      if (target.action) {
        const { count } = await runResourceAction({
          data: {
            resource: meta.name,
            action: target.action.name,
            ids: target.ids,
          },
        })

        toast.success(
          (target.action.success ?? `${target.action.label}: {count} done`)
            .replace('{count}', String(count)),
        )
      } else {
        await deleteResource({ data: { resource: meta.name, ids: target.ids } })

        toast.success(
          target.ids.length === 1
            ? `${meta.label} deleted`
            : `${target.ids.length} ${meta.pluralLabel.toLowerCase()} deleted`,
        )
      }

      setPending(null)
      setSelected([])
      await router.invalidate()
    } catch (error) {
      toast.error(message(error))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <header className="border-(--line) mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-5">
        <div>
          <p className="eyebrow text-primary flex items-center gap-2">
            <PanelIcon name={meta.icon} className="size-3.5" />
            Workspace
          </p>
          <h1 className="font-display mt-2 text-3xl leading-none font-light tracking-tight">
            {meta.pluralLabel}
          </h1>
          {meta.description ? (
            <p className="text-muted-foreground mt-3 max-w-xl text-sm text-pretty">
              {meta.description}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {total} total
          </Badge>
          {meta.can.create ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              New {meta.label.toLowerCase()}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {meta.searchable ? (
          <div className="relative min-w-52 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={meta.searchPlaceholder}
              className="pl-9"
              aria-label={meta.searchPlaceholder}
            />
          </div>
        ) : null}

        {meta.filters.map((filter) => (
          <Select
            key={filter.name}
            value={filters[filter.name] ?? FILTER_ALL}
            onValueChange={(value) => setFilter(filter.name, value)}
          >
            <SelectTrigger className="w-40" aria-label={`Filter by ${filter.label}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>All {filter.label.toLowerCase()}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSearch({ q: undefined, filters: undefined })}
          >
            <X className="size-4" />
            Reset
          </Button>
        ) : null}
      </div>

      {selected.length > 0 ? (
        <div className="bg-accent/40 border-(--line) mb-3 flex flex-wrap items-center justify-between gap-3 border px-3 py-2 font-mono text-xs">
          <span className="tabular-nums">
            {selected.length} selected on this page
          </span>

          <div className="flex flex-wrap items-center gap-2">
            {bulkActions.map((action) => (
              <Button
                key={action.name}
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() =>
                  start({ action, ids: selected, label: selectionLabel() })
                }
              >
                {action.icon ? (
                  <PanelIcon name={action.icon} className="size-4" />
                ) : null}
                {action.label}
              </Button>
            ))}

            {meta.can.delete ? (
              <Button
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() =>
                  start({ action: null, ids: selected, label: selectionLabel() })
                }
              >
                <Trash2 className="size-4" />
                Delete selected
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="border-(--line) flex flex-col items-center gap-3 border border-dashed px-6 py-16 text-center">
          <div className="border-(--line) text-muted-foreground flex size-11 items-center justify-center border">
            <PanelIcon name={meta.icon} className="size-5" />
          </div>
          <div>
            <p className="font-medium">
              {filtered
                ? `No ${meta.pluralLabel.toLowerCase()} match these filters`
                : `No ${meta.pluralLabel.toLowerCase()} yet`}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {filtered
                ? 'Try clearing the search or the filters.'
                : meta.can.create
                  ? `Create the first one — it only takes a name.`
                  : 'Rows will appear here once they exist.'}
            </p>
          </div>
        </div>
      ) : (
        <ResourceTable
          meta={meta}
          items={items}
          sort={sort}
          dir={dir}
          selected={selected}
          onSort={toggleSort}
          onSelect={(id, checked) =>
            setSelected((prev) =>
              checked ? [...prev, id] : prev.filter((value) => value !== id),
            )
          }
          onSelectAll={(checked) =>
            setSelected(checked ? items.map((item) => item.id) : [])
          }
          onEdit={(item) => setEditing(item.id)}
          onDelete={(item) =>
            start({
              action: null,
              ids: [item.id],
              label: recordTitle(meta, item),
            })
          }
          onAction={(action, item) =>
            start({
              action,
              ids: [item.id],
              label: recordTitle(meta, item),
            })
          }
        />
      )}

      <nav className="mt-4 flex items-center justify-between gap-3 text-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onSearch({ page: page - 1 })}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>

        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          Page {page} of {pageCount} · {pageSize} per page
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onSearch({ page: page + 1 })}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </nav>

      <ResourceFormDialog
        meta={meta}
        record={creating ? null : editing}
        open={creating || Boolean(editing)}
        onOpenChange={(open) => {
          if (open) return
          if (creating) setCreating(false)
          else setEditing(undefined)
        }}
      />

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action
                ? (pending.action.confirm?.title ??
                  `${pending.action.label} ${pending.label}?`)
                : `Delete ${pending?.label}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action?.confirm?.description ?? 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pending?.action ? pending.action.variant : 'destructive'}
              disabled={running}
              onClick={(event) => {
                /** Keep the dialog up until the request settles. */
                event.preventDefault()
                if (pending) void run(pending)
              }}
            >
              {running
                ? 'Working…'
                : pending?.action
                  ? (pending.action.confirm?.confirmLabel ?? pending.action.label)
                  : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
