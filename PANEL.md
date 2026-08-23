# The panel

A Filament-style resource layer, built on this kit's own stack.

You declare a resource — a Drizzle table, the columns it shows, the fields it
edits — and you get a full screen: search, filters, sortable columns,
pagination, a create/edit dialog, row and bulk delete, your own custom actions,
role-aware buttons, a counter on the overview and a place in the ⌘K palette. No
page, no form and no query written by hand.

```bash
src/resources/projects.ts   # one file
→ /dashboard/projects       # one screen
```

## Adding a resource

1. Add your table to `src/db/schema.ts`, then `bun run db:generate && bun run db:migrate`.
2. Write `src/resources/<name>.ts`:

```ts
import { defineResource } from '#/lib/panel/define'
import { invoice } from '#/db/schema'

const STATUS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
]

export const invoices = defineResource({
  name: 'invoices',            // URL: /dashboard/invoices
  label: 'Invoice',
  pluralLabel: 'Invoices',
  icon: 'layers',              // one of the names in src/components/panel/panel-icon.tsx

  table: invoice,
  tenantColumn: invoice.userId,

  columns: [
    { name: 'number', label: 'Number', column: invoice.number,
      sortable: true, searchable: true, primary: true },
    { name: 'status', label: 'Status', column: invoice.status, kind: 'badge',
      variants: { paid: 'default', sent: 'secondary', draft: 'outline' } },
    { name: 'total', label: 'Total', column: invoice.total, kind: 'number', align: 'right' },
    { name: 'dueAt', label: 'Due', column: invoice.dueAt, kind: 'date', sortable: true, align: 'right' },
  ],

  fields: [
    { name: 'number', label: 'Number', required: true, max: 40 },
    { name: 'status', label: 'Status', kind: 'select', required: true,
      defaultValue: 'draft', options: STATUS },
    { name: 'total', label: 'Total', kind: 'number', required: true, min: 0 },
    { name: 'dueAt', label: 'Due date', kind: 'date' },
  ],

  filters: [{ name: 'status', label: 'Status', column: invoice.status, options: STATUS }],

  defaultSort: { column: 'dueAt', dir: 'desc' },
  roles: { delete: ['owner', 'admin'] },
})
```

3. Register it in `src/resources/index.ts`. It appears in the sidebar.

That is the whole loop. `id` and the tenant column are stamped for you.

## What each part does

| Key | Effect |
|---|---|
| `columns[].sortable` | Column header becomes a sort toggle, and `?sort=` accepts its name |
| `columns[].searchable` | Included in the `LIKE %q%` search behind the search box |
| `columns[].kind` | How the cell renders: `text` `badge` `number` `boolean` `date` `datetime` |
| `columns[].primary` | The value used to name a record in dialogs ("Delete Acme migration?") |
| `fields[]` | The create/edit dialog, and the Zod schema both sides validate with |
| `fields[].on` | `{ create: false }` for values only set later; `{ update: false }` for immutables |
| `filters[]` | A dropdown above the table, and a key `?filters=` accepts |
| `actions` | Turn a whole action off — `create: false` makes a read-only screen |
| `roles` | Which member roles may `view` / `create` / `update` / `delete` |
| `rowActions` | Your own actions, in the row menu and the bulk bar — see below |
| `detailPath` | A route to one record (`/dashboard/admin/users/$userId`). Links the primary column and adds an Open item to the row menu |
| `joins` | Read extra columns from another table. Writes still go to `table` only |
| `onCreate` | Extra column values stamped on insert (`createdById`, defaults, …) |
| `beforeDelete` | Throw to block a delete — the message becomes the user's toast |
| `stats` | `false` to keep it off the overview |
| `badge` | `true` to show a row count next to the sidebar link. One COUNT per load |

## Custom actions

Filament's `Action::make('archive')`, in this kit's terms. Anything that is not
create, update or delete — archive, resend, mark paid, sync — is a `rowAction`:

```ts
rowActions: [
  {
    name: 'archive',                    // what the client sends; keep it stable
    label: 'Archive',
    icon: 'archive',                    // from src/components/panel/panel-icon.tsx
    variant: 'destructive',             // colours the menu item and the button
    roles: ['owner', 'admin'],          // its own gate, independent of delete
    confirm: {                          // omit to run straight from the menu
      description: 'Archived projects drop out of the active filter.',
      confirmLabel: 'Archive',
    },
    success: '{count} archived',        // {count} = how many rows ran
    on: { row: true, bulk: true },      // the default
    handler: async (ids, ctx) => {
      await getDb().update(project)
        .set({ status: 'archived' })
        .where(inArray(project.id, ids))
    },
  },
]
```

`ids` has already been re-selected under the resource's own scope before your
handler runs, so you can use it directly — see the security model below.
Throwing inside the handler aborts the action and the message becomes the
user's toast, exactly like `beforeDelete`.

## Global search

Press **⌘K** (Ctrl+K) anywhere in the panel. One request searches every
resource the current role may view, five hits each, using the same `searchable`
columns as the list screens — so a resource opts in simply by having one.

Picking a hit goes to that list with `?edit=<id>`, which opens the record
whether or not it is on the page. That parameter is a general one: every row
you open writes it, so any record in the panel is linkable.

If the resource is read-only, or your role may view but not update, there is
nothing to open — the hit goes to its list carrying the term you typed
instead, and `?edit=` is ignored. (Filament falls back to a View page here;
this panel does not have one yet.)

## How it is put together

```
src/lib/panel/
  types.ts        the JSON contract between server and client
  define.ts       defineResource() — SERVER ONLY
  query.ts        the generic SQL: where / order / count / insert / update / delete
  form-schema.ts  fields -> Zod, used by the dialog AND the server function
  search.ts       the URL state schema for every list
src/resources/    your resources + the registry — SERVER ONLY
src/lib/server/panel.ts   the nine server functions the whole panel runs on
src/components/panel/     the generic UI, including the ⌘K palette
src/routes/dashboard/
  route.tsx       sidebar shell (nav comes from the server)
  index.tsx       overview widgets
  $resource.tsx   every list screen
```

**Resource definitions never reach the browser.** The client is handed JSON
metadata — labels, kinds, options, what this user may do — and renders from
that. Two consequences worth knowing:

- adding your tenth resource adds **zero bytes** to the client bundle
- your table names, column allowlists and role rules stay on the server

## Security model

Four rules, and they are the reason the panel can be this generic:

1. **The tenant filter comes from the session.** Every read, update and delete
   is scoped by `tenantColumn` = the org on the session, never a request field.
2. **Sort and filter keys are allowlisted.** `?sort=` and `?filters[…]=` are
   looked up in the resource's own maps; anything else is dropped before SQL.
   A column you did not declare is unreachable.
3. **Permissions are checked on the server, every time.** `meta.can` and
   `meta.rowActions` only decide whether a button renders; the server function
   re-checks the role and refuses regardless of what the client sends. A
   resource you cannot `view` is a 404, not a 403.
4. **Ids reach a handler only after they are vouched for.** The engine's own
   statements scope by tenant inside the SQL. `beforeDelete` and a custom
   action's `handler` cannot — they are your code, holding strings that came
   from a browser — so the engine re-selects those ids under the tenant filter
   first and passes on only what survives.

Field writes are allowlisted the same way: only declared `fields` are written,
so an extra key in the request body cannot reach a column you never exposed.
Custom actions travel as a **name**, looked up in the resource's own map — the
browser never sends a query, a column or a function.

## Limits worth knowing before you lean on it

- **Joins are read-only.** Writes go to `table`. For editing across tables,
  write a normal server function.
- **No relation picker yet.** A foreign key is a `select` with options you
  supply, or a `text` field. Add a `relation` field kind when you need one.
- **Offset pagination.** Fine to tens of thousands of rows on D1; past that,
  move the resource to keyset pagination.
- **No per-row rules.** `roles` is per resource and per action. Row-level
  conditions go in `beforeDelete`, a custom action's handler, or a normal
  server function.
- **Actions are always visible.** A `rowAction` cannot hide itself based on the
  row — "Pause" shows on an already-paused project. Guard inside the handler.
- **Search is `LIKE %term%`.** No index can serve it, and global search runs
  one such query per resource. For large tables, add SQLite FTS or narrow
  `searchable` to fewer columns.
- **The dialog is one column of fields.** No tabs, sections or conditional
  fields — that is the next thing to add if you need it.
- **No per-record page is generated.** `?edit=` opens the edit dialog; there is
  no read-only detail view (Filament's infolist) and no relation manager.
  `detailPath` links out to a page you wrote yourself — the panel supplies the
  link, never the screen, and that route has to check the role for itself.
