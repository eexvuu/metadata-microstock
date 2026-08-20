import { Badge } from '#/components/ui/badge'
import type { PanelColumn } from '#/lib/panel/types'

/**
 * Renders one cell from its column's `kind`. This is the reason resources can
 * be plain JSON: formatting is declared, not passed as a function.
 *
 * Need something this list cannot express? Add a `kind` here and to
 * `ColumnKind` — one place, every resource gets it.
 */
export function PanelCell({
  column,
  value,
}: {
  column: PanelColumn
  value: unknown
}) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>
  }

  switch (column.kind) {
    case 'badge':
      return (
        <Badge variant={column.variants?.[String(value)] ?? 'outline'}>
          {humanize(String(value))}
        </Badge>
      )

    case 'boolean':
      return <span>{value ? 'Yes' : 'No'}</span>

    case 'number':
      return <span className="tabular-nums">{String(value)}</span>

    case 'date':
      return (
        <span className="tabular-nums">{toDate(value)?.toLocaleDateString() ?? '—'}</span>
      )

    case 'datetime':
      return (
        <span className="tabular-nums">{toDate(value)?.toLocaleString() ?? '—'}</span>
      )

    default:
      return <span>{String(value)}</span>
  }
}

/** Server functions may hand back a Date, an ISO string or an epoch number. */
function toDate(value: unknown) {
  const date =
    value instanceof Date ? value : new Date(value as string | number)

  return Number.isNaN(date.getTime()) ? null : date
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ')
}
