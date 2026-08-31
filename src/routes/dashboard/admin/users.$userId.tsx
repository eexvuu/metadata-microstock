import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, Coins, Eye, Loader2, LogOut, Pause, Play, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { PageHead } from '#/components/page-head'
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
  deleteUserKey,
  getUserDetail,
  grantUserTokens,
  revealUserKey,
  revokeUserSessions,
  setUserKeyStatus,
  updateUserAdmin,
} from '#/lib/server/admin'

/**
 * One account, whole: who they are, what they have run, how many keys they
 * hold — and the three things an admin can change about them.
 *
 * The key list shows previews until an admin asks for one. Revealing is a
 * deliberate click per key, the plaintext lives in component state and nowhere
 * else, and `revealUserKey` writes an audit row before it answers — so every
 * reading of somebody's credential has a name and a timestamp against it.
 */
export const Route = createFileRoute('/dashboard/admin/users/$userId')({
  loader: ({ params }) => getUserDetail({ data: { id: params.userId } }),
  component: UserDetail,
})

function UserDetail() {
  const { user, keys, runs, tokens, totals } = Route.useLoaderData()
  const router = useRouter()

  const [name, setName] = useState(user.name)
  const [role, setRole] = useState(user.role)
  const [banned, setBanned] = useState(user.banned)
  const [banReason, setBanReason] = useState(user.banReason ?? '')
  const [busy, setBusy] = useState(false)
  /** Revealed plaintext, per key id. Never in the loader, never persisted. */
  const [shown, setShown] = useState<Record<string, string>>({})
  const [grant, setGrant] = useState('')
  const [grantNote, setGrantNote] = useState('')
  const [revealing, setRevealing] = useState<string | null>(null)
  /** The key a delete confirmation is open for. Null when the dialog is shut. */
  const [pendingDelete, setPendingDelete] = useState<
    { id: string; preview: string } | null
  >(null)

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

  const reveal = async (id: string) => {
    setRevealing(id)
    try {
      const { key } = await revealUserKey({ data: { id } })
      setShown((previous) => ({ ...previous, [id]: key }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setRevealing(null)
    }
  }

  const addTokens = async () => {
    setBusy(true)
    try {
      const { balance } = await grantUserTokens({
        data: { id: user.id, amount: Number(grant), note: grantNote || undefined },
      })
      toast.success(`Balance is now ${balance}`)
      setGrant('')
      setGrantNote('')
      await router.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const toggleKey = async (id: string, status: 'active' | 'disabled') => {
    setBusy(true)
    try {
      await setUserKeyStatus({ data: { id, status } })
      toast.success(status === 'active' ? 'Key enabled' : 'Key disabled')
      await router.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const removeKey = async (id: string) => {
    setBusy(true)
    try {
      await deleteUserKey({ data: { id } })
      toast.success('Key deleted')
      setPendingDelete(null)
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

      <section className="border-(--line) border">
        <header className="border-(--line) flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-display flex items-center gap-2 text-lg font-medium">
            <Coins className="text-primary size-4" strokeWidth={1.5} />
            Vector tokens
          </h2>
          <span className="font-display text-2xl leading-none font-light tabular-nums">
            {tokens.balance.toLocaleString()}
          </span>
        </header>

        <div className="space-y-4 p-4">
          <p className="text-muted-foreground text-sm text-pretty">
            One token buys one image through the vectorizer, and a file that
            fails gives its token back. Every account starts with a trial
            credit; this is where one is topped up past it. The balance is the
            sum of the entries below, never a stored number — so granting is
            writing a row, and a mistake is undone by writing a negative one
            rather than by editing anything.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32 space-y-2">
              <Label htmlFor="grant">Tokens</Label>
              <Input
                id="grant"
                type="number"
                value={grant}
                disabled={busy}
                placeholder="100"
                onChange={(event) => setGrant(event.target.value)}
              />
            </div>

            <div className="min-w-48 flex-1 space-y-2">
              <Label htmlFor="grant-note">Note</Label>
              <Input
                id="grant-note"
                value={grantNote}
                disabled={busy}
                placeholder="Why this entry exists"
                onChange={(event) => setGrantNote(event.target.value)}
              />
            </div>

            <Button onClick={() => void addTokens()} disabled={busy || grant === ''}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Coins className="size-4" />}
              Add tokens
            </Button>
          </div>

          <p className="text-muted-foreground font-mono text-xs">
            negative takes tokens back · an entry names an admin only when one wrote it
          </p>

          {tokens.ledger.length === 0 ? (
            <p className="border-(--line) text-muted-foreground border border-dashed py-8 text-center font-mono text-xs">
              no token entries on this account
            </p>
          ) : (
            <div className="border-(--line) overflow-x-auto border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24 text-right">Delta</TableHead>
                    <TableHead className="w-28">Reason</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-44 text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.ledger.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell
                        className={`text-right font-mono tabular-nums ${
                          entry.delta > 0 ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                      </TableCell>
                      <TableCell>
                        {/* Credits stand out; spend and refund are the machine talking. */}
                        <Badge
                          variant={
                            entry.reason === 'grant' || entry.reason === 'signup'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {entry.reason}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {entry.note ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right font-mono text-xs">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-medium tracking-tight">
          Keys held
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Every key on the account, whether they hold one or twenty. Revealing,
          disabling and deleting are each recorded against the admin who did it
          — those entries are in the audit log and cannot be removed from here.
        </p>
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
                  <TableHead className="w-96">Key</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-36">Last used</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>{key.label}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {shown[key.id] ? (
                        <span className="break-all select-all">
                          {shown[key.id]}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          {key.preview}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5"
                            disabled={revealing !== null}
                            onClick={() => reveal(key.id)}
                          >
                            {revealing === key.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Eye className="size-3" />
                            )}
                            reveal
                          </Button>
                        </span>
                      )}
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          disabled={busy}
                          onClick={() =>
                            toggleKey(
                              key.id,
                              key.status === 'active' ? 'disabled' : 'active',
                            )
                          }
                        >
                          {key.status === 'active' ? (
                            <Pause className="size-3" />
                          ) : (
                            <Play className="size-3" />
                          )}
                          {key.status === 'active' ? 'disable' : 'enable'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive h-7 px-2"
                          disabled={busy}
                          onClick={() =>
                            setPendingDelete({ id: key.id, preview: key.preview })
                          }
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.preview}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This app holds the only copy. {user.name} will have to paste the
              key again. Disable it instead if you only want runs to skip it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && removeKey(pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section>
        <h2 className="font-display text-xl font-medium tracking-tight">
          Recent runs
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          A finished run keeps its rows for seven days, and Open shows them.
          Reading them is recorded against the admin who did it, the same way a
          key reveal is.
        </p>
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
                  <TableHead className="w-24 text-right">Result</TableHead>
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
                    <TableCell className="text-right">
                      {run.resultExpiresAt ? (
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                          <Link
                            to="/dashboard/admin/runs/$runId"
                            params={{ runId: run.id }}
                          >
                            <Eye className="size-3" />
                            open
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground font-mono text-xs">
                          gone
                        </span>
                      )}
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
