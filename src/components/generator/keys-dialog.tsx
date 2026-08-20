import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
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
  setGeminiKeyStatus,
} from '#/lib/server/gemini-keys'

export interface KeySummary {
  id: string
  label: string
  preview: string
  status: string
  lastUsedAt: number | null
}

/**
 * Keys, where they are actually used.
 *
 * They used to have their own screen in the sidebar, which made them look like
 * a thing you configure once somewhere else. Only this tool needs a key — the
 * shelf's other tools will not — so the whole of key management lives inside
 * it now, one click from the rail that shows the keys working.
 */
export function KeysDialog({
  keys,
  children,
}: {
  keys: KeySummary[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    try {
      const result = await addGeminiKeys({
        data: { keys: raw, label: label || undefined },
      })

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Your Gemini keys</DialogTitle>
          <DialogDescription>
            Free from{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              aistudio.google.com/apikey
            </a>
            . Every key adds about 15 requests a minute, so two keys is twice as
            fast. They are encrypted before they are stored, and the only time a
            full key leaves our server is when this tab needs it to call Google.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            disabled={busy}
            rows={4}
            spellCheck={false}
            placeholder={'AIza…\nAIza…'}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="key-label">Label (optional)</Label>
              <Input
                id="key-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                disabled={busy}
                placeholder="Personal account"
                className="w-56"
              />
            </div>
            <Button
              onClick={() => void add()}
              disabled={busy || raw.trim().length === 0}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add and verify
            </Button>
          </div>
          <p className="text-muted-foreground text-xs text-pretty">
            One per line — paste your{' '}
            <code className="border-(--line) text-foreground border px-1 font-mono text-[0.7rem]">
              gemini-key.txt
            </code>{' '}
            as-is, comments and blank lines included. Each key is checked against
            Google before it is saved.
          </p>
        </div>

        {keys.length > 0 ? (
          <div className="border-(--line) max-h-64 overflow-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="w-40">Key</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-32">Last used</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.label}</TableCell>
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
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => void toggle(key.id, key.status)}
                      >
                        {key.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${key.preview}`}
                        onClick={() => void remove(key.id, key.preview)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="border-(--line) text-muted-foreground border border-dashed py-6 text-center font-mono text-xs">
            no keys yet — paste one above and the tool is ready
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The empty state on the rail: the one thing standing between you and a run. */
export function AddFirstKey({ keys }: { keys: KeySummary[] }) {
  return (
    <div className="border-(--line) flex flex-col items-center gap-3 border border-dashed px-4 py-6 text-center">
      <p className="text-muted-foreground max-w-md text-sm text-pretty">
        This tool runs on your own Google key, which is free and takes a minute
        to make. Nothing else is needed.
      </p>
      <KeysDialog keys={keys}>
        <Button className="eyebrow">
          <KeyRound className="size-4" />
          Add your Gemini key
        </Button>
      </KeysDialog>
    </div>
  )
}
