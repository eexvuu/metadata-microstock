import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { PageHead } from '#/components/page-head'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { getAdminOverview } from '#/lib/server/admin'

/**
 * The admin landing screen: how many accounts, how much they are running, and
 * who signed up last. The heavy lifting — filtering, sorting, editing, banning
 * — lives in the panel resources this page links to.
 */
export const Route = createFileRoute('/dashboard/admin/')({
  loader: () => getAdminOverview(),
  component: AdminOverview,
})

function AdminOverview() {
  const data = Route.useLoaderData()

  const stats = [
    ['Accounts', data.users.toLocaleString(), `${data.newUsers} in the last 7 days`],
    ['Runs', data.runs.toLocaleString(), `${data.runsWeek} in the last 7 days`],
    ['Files processed', data.files.toLocaleString(), `${data.filesWeek} in the last 7 days`],
    ['Keys stored', data.keys.toLocaleString(), `${data.banned} banned account${data.banned === 1 ? '' : 's'}`],
  ]

  return (
    <div className="space-y-8">
      <PageHead index="Admin" title="Monitoring">
        Platform-wide numbers. Keys are counted, never read — an admin sees that
        an account has three of them and when they were last used, and nothing
        more.
      </PageHead>

      <dl className="border-(--line) grid grid-cols-2 gap-px border lg:grid-cols-4">
        {stats.map(([label, value, note]) => (
          <div key={label} className="bg-card p-5">
            <dt className="eyebrow text-muted-foreground">{label}</dt>
            <dd className="font-display mt-3 text-4xl leading-none font-light tabular-nums">
              {value}
            </dd>
            <p className="text-muted-foreground mt-2 font-mono text-[0.65rem]">
              {note}
            </p>
          </div>
        ))}
      </dl>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-medium tracking-tight">
            Newest accounts
          </h2>
          <Link
            to="/dashboard/$resource"
            params={{ resource: 'users' }}
            className="text-muted-foreground hover:text-primary eyebrow inline-flex items-center gap-1.5"
          >
            All users
            <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="border-(--line) mt-4 overflow-x-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-24">Role</TableHead>
                <TableHead className="w-24">State</TableHead>
                <TableHead className="w-36">Signed up</TableHead>
                <TableHead className="w-24 text-right">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {account.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={account.role === 'admin' ? 'default' : 'secondary'}
                    >
                      {account.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {account.banned ? (
                      <Badge variant="destructive">banned</Badge>
                    ) : (
                      <span className="text-muted-foreground font-mono text-xs">
                        active
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/dashboard/admin/users/$userId"
                      params={{ userId: account.id }}
                      className="text-primary eyebrow hover:underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
