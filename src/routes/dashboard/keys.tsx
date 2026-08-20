import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { PageHead } from '#/components/page-head'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import {
  addGeminiKeys,
  deleteGeminiKey,
  listGeminiKeys,
  setGeminiKeyStatus,
} from '#/lib/server/gemini-keys'

export const Route = createFileRoute('/dashboard/keys')({
  loader: () => listGeminiKeys(),
  component: KeysPage,
})

function KeysPage() {
  const keys = Route.useLoaderData()
  const router = useRouter()
  const [raw, setRaw] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    try {
      const result = await addGeminiKeys({ data: { keys: raw, label: label || undefined } })
      if (result.added > 0) {
        toast.success(`${result.added} key${result.added === 1 ? '' : 's'} added`)
        setRaw('')
        setLabel('')
      }
      // Every rejection is reported individually: pasting ten keys and being
      // told "some failed" is not actionable.
      for (const error of result.errors) toast.error(error)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (id: string, status: string) => {
    await setGeminiKeyStatus({
      data: { id, status: status === 'active' ? 'disabled' : 'active' },
    })
    await router.invalidate()
  }

  const remove = async (id: string, preview: string) => {
    await deleteGeminiKey({ data: { id } })
    toast.success(`${preview} removed`)
    await router.invalidate()
  }

  return (
    <div className="space-y-6">
      <PageHead index="Vault" title="API keys">
        Your own Gemini keys, used only by your account. They are encrypted
        before they are stored, and the only time a full key leaves our server is
        when your own browser needs it to call Google directly.
      </PageHead>

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow text-muted-foreground">Add keys</CardTitle>
          <CardDescription>
            One per line — paste your{' '}
            <code className="border-(--line) text-foreground border px-1 font-mono text-xs">
              gemini-key.txt
            </code>{' '}
            as-is, comments and
            blank lines included. Each key is checked against Google before it is
            saved. Get keys free at{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              aistudio.google.com/apikey
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            disabled={busy}
            rows={5}
            spellCheck={false}
            placeholder={'AIza...\nAIza...'}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                disabled={busy}
                placeholder="Personal account"
                className="w-56"
              />
            </div>
            <Button onClick={() => void add()} disabled={busy || raw.trim().length === 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add and verify
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow text-muted-foreground flex items-center gap-2">
            Saved keys
            <Badge variant="secondary">{keys.length}</Badge>
          </CardTitle>
          <CardDescription>
            Every key adds ~15 requests per minute to a run. Disable one to keep
            it without using it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="border-(--line) text-muted-foreground border border-dashed py-8 text-center font-mono text-xs">
              no keys yet — add one above to start generating
            </p>
          ) : (
            <div className="border-(--line) overflow-x-auto border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead className="w-44">Key</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-40">Last used</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.label}</TableCell>
                      <TableCell className="font-mono text-xs">{key.preview}</TableCell>
                      <TableCell>
                        <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                          {key.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleDateString()
                          : 'never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggle(key.id, key.status)}
                        >
                          {key.status === 'active' ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void remove(key.id, key.preview)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="eyebrow text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="text-primary size-4" strokeWidth={1.5} />
            How your keys are handled
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm text-pretty">
          <p>
            Stored AES-256-GCM encrypted in the database — the table holds
            ciphertext and the <code className="font-mono">AIza…1234</code>{' '}
            preview above, nothing else readable.
          </p>
          <p>
            Decrypted only for you, only when you start a run, and sent only to
            your own browser. Your media is never uploaded anywhere: the tab
            posts it straight to Google with your key.
          </p>
          <p>
            Keys belong to your account and nothing else reads them: an admin
            can see that you hold three keys and when they were last used, never
            the keys themselves.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
