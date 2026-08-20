import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, Loader2, LogOut, Save } from 'lucide-react'
import { toast } from 'sonner'

import { PageHead } from '#/components/page-head'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  getUserDetail,
  revokeUserSessions,
  updateUserAdmin,
} from '#/lib/server/admin'

/**
 * One account, whole: who they are, what they have run, how many keys they
 * hold — and the three things an admin can change about them.
 *
 * The key list is previews only. There is no button here, and no server
 * function anywhere, that returns someone else's key material.
 */
export const Route = createFileRoute('/dashboard/admin/users/$userId')({
  loader: ({ params }) => getUserDetail({ data: { id: params.userId } }),
  component: UserDetail,
})

function UserDetail() {
  const { user, keys, runs, totals } = Route.useLoaderData()
  const router = useRouter()

  const [name, setName] = useState(user.name)
  const [role, setRole] = useState(user.role)
  const [banned, setBanned] = useState(user.banned)
  const [banReason, setBanReason] = useState(user.banReason ?? '')
  const [busy, setBusy] = useState(false)

  const dirty =
    name !== user.name ||
    role !== user.role ||
    banned !== user.banned ||
    banReason !== (user.banReason ?? '')

  const save = async () => {
    setBusy(true)
    try {
      await updateUserAdmin({
        data: {
          id: user.id,
          name,
          role: role === 'admin' ? 'admin' : 'user',
          banned,
          banReason: banReason || undefined,
        },
      })
      toast.success('Account updated')
      await router.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    setBusy(true)
    try {
      await revokeUserSessions({ data: { id: user.id } })
      toast.success('Signed out everywhere')
      await router.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/dashboard/admin"
          className="text-muted-foreground hover:text-foreground eyebrow inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-3" />
          Monitoring
        </Link>
      </div>

      <PageHead
        index="Account"
        title={user.name}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
              {user.role}
            </Badge>
            {user.banned ? <Badge variant="destructive">banned</Badge> : null}
          </div>
        }
      >
        <span className="font-mono text-xs">{user.email}</span> · joined{' '}
        {new Date(user.createdAt).toLocaleDateString()} ·{' '}
        {totals.sessions} active session{totals.sessions === 1 ? '' : 's'}
      </PageHead>

      <dl className="border-(--line) grid grid-cols-2 gap-px border lg:grid-cols-4">
        {[
          ['Runs', totals.runs],
          ['Files processed', totals.files],
          ['Keys held', totals.keys],
          ['Sessions', totals.sessions],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-card p-5">
            <dt className="eyebrow text-muted-foreground">{label}</dt>
            <dd className="font-display mt-3 text-3xl leading-none font-light tabular-nums">
              {Number(value).toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      <section className="border-(--line) border">
        <header className="border-(--line) border-b px-4 py-3">
          <h2 className="font-display text-lg font-medium">Edit account</h2>
        </header>

        <div className="grid gap-5 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} disabled={busy} onValueChange={setRole}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="banned"
                checked={banned}
                disabled={busy}
                onCheckedChange={(value) => setBanned(value === true)}
              />
              <Label
                htmlFor="banned"
                className="text-foreground font-sans text-sm font-normal tracking-normal normal-case"
              >
                Banned — keeps the data, blocks the sign-in
              </Label>
            </div>
            <Input
              value={banReason}
              disabled={busy || !banned}
              placeholder="Reason (admins only)"
              onChange={(event) => setBanReason(event.target.value)}
            />
          </div>

          <div className="flex items-end gap-3">
            <Button onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save changes
            </Button>
            <Button variant="outline" onClick={() => void revoke()} disabled={busy}>
              <LogOut className="size-4" />
              Sign out everywhere
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-medium tracking-tight">
          Keys held
        </h2>
        {keys.length === 0 ? (
          <p className="border-(--line) text-muted-foreground mt-4 border border-dashed py-8 text-center font-mono text-xs">
            no keys on this account
          </p>
        ) : (
          <div className="border-(--line) mt-4 overflow-x-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="w-44">Preview</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-36">Last used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>{key.label}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {key.preview}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={key.status === 'active' ? 'default' : 'secondary'}
                      >
                        {key.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleDateString()
                        : 'never'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-medium tracking-tight">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="border-(--line) text-muted-foreground mt-4 border border-dashed py-8 text-center font-mono text-xs">
            this account has not run anything yet
          </p>
        ) : (
          <div className="border-(--line) mt-4 overflow-x-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folder</TableHead>
                  <TableHead className="w-28">Tool</TableHead>
                  <TableHead className="w-32">Platform</TableHead>
                  <TableHead className="w-24">Files</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-40">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="max-w-64 truncate font-mono text-xs">
                      {run.folderName}
                    </TableCell>
                    <TableCell className="text-sm">{run.tool}</TableCell>
                    <TableCell className="text-sm capitalize">
                      {run.platform}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {run.filesDone}/{run.filesTotal}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          run.status === 'complete'
                            ? 'default'
                            : run.status === 'error'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {new Date(run.startedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
