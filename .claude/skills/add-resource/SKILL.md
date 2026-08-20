---
name: add-resource
description: Use when adding or changing an admin/CRUD screen in this repo's panel — a table of rows with filters, sorting, a create/edit dialog, delete, or a custom row action like Archive or Resend. Covers src/resources/, defineResource options, custom actions, roles, and the verification loop. Use instead of hand-writing a dashboard route, table component or form.
---

# Adding a panel resource

One file in `src/resources/` becomes a full screen at `/dashboard/<name>`:
table, search, filters, sortable columns, pagination, create/edit dialog, row
and bulk delete, your custom actions, a counter on the overview, and a place in
the ⌘K palette. No page, form or query is written by hand.

Read [PANEL.md](../../../PANEL.md) for the full option table. This skill is the
procedure and the traps.

## Before you start

**Is a resource actually right?** It is, if the screen is rows from one table
with a form over some of its columns. It is not, if the screen is a wizard, a
detail page, a chart, or writes across several tables — that is a normal server
function in `src/lib/server/` plus a route.

**Does the table exist?** If not, use the `change-schema` skill first. A
resource points at a Drizzle table that is already migrated.

## Procedure

1. **Copy `src/resources/projects.ts`.** It is the reference: joins, badge
   column, filter, role gate, `onCreate`, and two custom actions. Point it at
   your table and delete what you don't need.

2. **Declare columns.** Each needs `name` (the JSON key and the `?sort=` value —
   keep it stable), `label` and `column` (a Drizzle column reference).
   - `sortable: true` makes the header a sort toggle
   - `searchable: true` puts it behind the search box **and** in ⌘K
   - `primary: true` marks the column that names a record in dialogs
   - `kind` is how the cell renders: `text` `badge` `number` `boolean` `date`
     `datetime`. `badge` pairs with `variants: { value: 'secondary', … }`

3. **Declare fields** — these are the create/edit dialog and the Zod schema
   both the dialog and the server validate with. `kind` is `text` `textarea`
   `number` `select` `switch` `date`. Use `on: { create: false }` for values set
   later, `on: { update: false }` for immutables.

4. **Add filters** for the low-cardinality columns worth a dropdown. The first
   filter also becomes the breakdown under the overview counter.

5. **Set `tenantColumn`** to the organization column. Omit it only for a
   genuinely global table, and then gate the resource with `roles.view`.

6. **Register it** in `src/resources/index.ts`. Sidebar order is array order.

7. **Verify.** `bun run typecheck`, then open `/dashboard/<name>` and exercise
   create, edit, delete, a filter and a sort. `defineResource` throws at import
   time for most misconfigurations, so a broken resource shows up as a failed
   page load, not a silent bug.

## Custom actions

Anything that is not create/update/delete — Archive, Resend invite, Mark paid,
Sync:

```ts
rowActions: [{
  name: 'archive',            // what the client sends; keep it stable
  label: 'Archive',
  icon: 'archive',
  variant: 'destructive',
  roles: ['owner', 'admin'],  // its own gate, independent of delete
  confirm: { description: 'Archived rows drop out of the active filter.' },
  success: '{count} archived',
  on: { row: true, bulk: true },   // the default
  handler: async (ids, ctx) => { … },
}]
```

`ids` has already been re-selected under the tenant filter, so use it directly.
Throw inside the handler to abort — the message becomes the user's toast.

## Traps

- **`defaultSort.column` must be a column you marked `sortable`.** Throws at
  import otherwise.
- **Every `field.name` must match a property on the resource's own table.**
  Joined columns are readable, never writable. Throws at import.
- **Icons come from a closed union** (`folder` `users` `credit-card` `mail`
  `layers` `gauge` `play` `pause` `archive` `check` `send`). Add to
  `PanelIcon` in `src/lib/panel/types.ts` and to the map in
  `src/components/panel/panel-icon.tsx` before using a new one.
- **Never import `src/resources/` outside `src/lib/server/panel.ts`.** That
  import boundary is what keeps table names and role rules out of the browser.
- **`roles` hides the button *and* refuses on the server.** Don't add a check in
  the component and call it done; don't skip the `roles` entry and hide the
  button in JSX.
- **A read-only resource** (`actions: { create: false, update: false, delete:
  false }`) has no edit dialog, so ⌘K sends its hits to the filtered list
  instead. That is intended — don't add an empty dialog to "fix" it.
- **`searchable` on many columns costs D1 row reads**, because global search
  runs one `LIKE %term%` per resource on every keystroke burst.

## Reference resources

- `src/resources/projects.ts` — full CRUD, join, filter, role gate, two actions
- `src/resources/members.ts` — no create, edit one field, `beforeDelete` guard,
  sidebar badge
- `src/resources/subscriptions.ts` — read-only, `roles.view` gated
