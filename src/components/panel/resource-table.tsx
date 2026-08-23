import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'

import { PanelCell } from '#/components/panel/panel-cell'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { PanelIcon } from '#/components/panel/panel-icon'
import { cn } from '#/lib/utils'
import type { ReactElement, ReactNode } from 'react'
import type {
  PanelCustomAction,
  PanelRecord,
  PanelResourceMeta,
} from '#/lib/panel/types'

/**
 * TanStack types `to` against the generated route tree, and a resource hands
 * the panel a plain string — deliberately, since that string is all the browser
 * is allowed to know about `src/resources/`. Widen the props once here rather
 * than teaching a generic table about every route in the app.
 */
const DetailLink = Link as unknown as (props: {
  to: string
  params: Record<string, string>
  className?: string
  children?: ReactNode
}) => ReactElement

/**
 * The list table for any resource. It knows nothing about projects, members or
 * billing — only about the column metadata it was handed.
 */
export function ResourceTable({
  meta,
  items,
  sort,
  dir,
  selected,
  onSort,
  onSelect,
  onSelectAll,
  onEdit,
  onDelete,
  onAction,
}: {
  meta: PanelResourceMeta
  items: PanelRecord[]
  sort: string
  dir: 'asc' | 'desc'
  selected: string[]
  onSort: (column: string) => void
  onSelect: (id: string, checked: boolean) => void
  onSelectAll: (checked: boolean) => void
  onEdit: (record: PanelRecord) => void
  onDelete: (record: PanelRecord) => void
  onAction: (action: PanelCustomAction, record: PanelRecord) => void
}) {
  const custom = meta.rowActions.filter((action) => action.on.row)
  const detail = meta.detail
  const selectable =
    meta.can.delete || meta.rowActions.some((action) => action.on.bulk)
  const rowActions =
    meta.can.update || meta.can.delete || custom.length > 0 || detail !== undefined
  const allSelected = items.length > 0 && selected.length === items.length

  return (
    <div className="border-(--line) overflow-hidden border">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable ? (
              <TableHead className="w-10 pl-3">
                <Checkbox
                  checked={allSelected}
                  aria-label="Select all rows on this page"
                  onCheckedChange={(checked) => onSelectAll(checked === true)}
                />
              </TableHead>
            ) : null}

            {meta.columns.map((column) => (
              <TableHead
                key={column.name}
                className={cn(column.align === 'right' && 'text-right')}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.name)}
                    className="hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5"
                    aria-label={`Sort by ${column.label}`}
                  >
                    {column.label}
                    {sort === column.name ? (
                      dir === 'asc' ? (
                        <ArrowUp className="size-3.5" />
                      ) : (
                        <ArrowDown className="size-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="text-muted-foreground size-3.5" />
                    )}
                  </button>
                ) : (
                  column.label
                )}
              </TableHead>
            ))}

            {rowActions ? <TableHead className="w-12" /> : null}
          </TableRow>
        </TableHeader>

        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.id}
              data-state={selected.includes(item.id) ? 'selected' : undefined}
            >
              {selectable ? (
                <TableCell className="pl-3">
                  <Checkbox
                    checked={selected.includes(item.id)}
                    aria-label="Select row"
                    onCheckedChange={(checked) =>
                      onSelect(item.id, checked === true)
                    }
                  />
                </TableCell>
              ) : null}

              {meta.columns.map((column) => (
                <TableCell
                  key={column.name}
                  className={cn(
                    column.align === 'right' && 'text-right',
                    column.className,
                  )}
                >
                  {detail && column.primary ? (
                    <DetailLink
                      to={detail.to}
                      params={{ [detail.param]: item.id }}
                      className="hover:text-primary hover:underline"
                    >
                      <PanelCell column={column} value={item[column.name]} />
                    </DetailLink>
                  ) : (
                    <PanelCell column={column} value={item[column.name]} />
                  )}
                </TableCell>
              ))}

              {rowActions ? (
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Row actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {detail ? (
                        <DropdownMenuItem asChild>
                          <DetailLink
                            to={detail.to}
                            params={{ [detail.param]: item.id }}
                          >
                            <Eye className="size-4" />
                            {detail.label}
                          </DetailLink>
                        </DropdownMenuItem>
                      ) : null}

                      {detail && meta.can.update ? <DropdownMenuSeparator /> : null}

                      {meta.can.update ? (
                        <DropdownMenuItem onSelect={() => onEdit(item)}>
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                      ) : null}

                      {custom.length > 0 && (meta.can.update || detail) ? (
                        <DropdownMenuSeparator />
                      ) : null}

                      {custom.map((action) => (
                        <DropdownMenuItem
                          key={action.name}
                          variant={action.variant}
                          onSelect={() => onAction(action, item)}
                        >
                          {action.icon ? (
                            <PanelIcon name={action.icon} className="size-4" />
                          ) : null}
                          {action.label}
                        </DropdownMenuItem>
                      ))}

                      {meta.can.delete ? (
                        <>
                          {meta.can.update || custom.length > 0 || detail ? (
                            <DropdownMenuSeparator />
                          ) : null}
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onDelete(item)}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** The label that identifies a record in dialogs — the `primary` column. */
export function recordTitle(meta: PanelResourceMeta, record: PanelRecord) {
  const column =
    meta.columns.find((candidate) => candidate.primary) ?? meta.columns[0]

  const value = column ? record[column.name] : record.id

  return value === null || value === undefined || value === ''
    ? record.id
    : String(value)
}
