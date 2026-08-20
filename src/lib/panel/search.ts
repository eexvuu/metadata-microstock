import { z } from 'zod'

/**
 * List state for EVERY resource, in the URL.
 *
 * Same principle as the rest of the kit — filters are shareable, bookmarkable
 * and survive back/forward — but generic, because the panel does not know the
 * resource at compile time. `filters` is an open record here; the server
 * checks each key against the resource's declared filters and silently drops
 * anything it does not recognise, so a hand-edited URL can never reach a
 * column the resource did not expose.
 */
export const panelSearchSchema = z.object({
  q: z.string().optional(),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).default(1),
  filters: z.record(z.string(), z.string()).optional(),
  /**
   * The record whose edit dialog is open. In the URL rather than in React
   * state so a row is linkable — which is what makes global search able to
   * send you to one record on a list of ten thousand.
   */
  edit: z.string().optional(),
})

export type PanelSearch = z.infer<typeof panelSearchSchema>

export const PAGE_SIZE = 20

/** Shortest query global search will run. One letter matches everything. */
export const SEARCH_MIN = 2

/** Hits per resource in the ⌘K palette. Filament's equivalent default is 50. */
export const SEARCH_LIMIT = 5

/** The value a filter dropdown uses for "no filter". */
export const FILTER_ALL = 'all'
