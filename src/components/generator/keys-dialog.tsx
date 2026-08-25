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
import { useLocale, useMessages } from '#/lib/i18n'

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
  const m = useMessages()
  const { tag } = useLocale()
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
        toast.success(m.keys.added(result.added))
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
    toast.success(m.keys.removed(preview))
    await router.invalidate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.keys.dialogTitle}</DialogTitle>
          <DialogDescription>{m.keys.dialogDescription}</DialogDescription>
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
              <Label htmlFor="key-label">{m.keys.labelOptional}</Label>
              <Input
                id="key-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                disabled={busy}
                placeholder={m.keys.labelPlaceholder}
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
              {m.keys.addAndVerify}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs text-pretty">
            {m.keys.pasteHint}
          </p>
        </div>

        {keys.length > 0 ? (
          <div className="border-(--line) max-h-64 overflow-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.keys.columnLabel}</TableHead>
                  <TableHead className="w-40">{m.keys.columnKey}</TableHead>
                  <TableHead className="w-24">{m.keys.columnStatus}</TableHead>
                  <TableHead className="w-32">{m.keys.columnLastUsed}</TableHead>
                  <TableHead className="w-32 text-right">
                    {m.keys.columnActions}
                  </TableHead>
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
                        {key.status === 'active'
                          ? m.keys.status.active
                          : m.keys.status.disabled}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleDateString(tag)
                        : m.keys.never}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => void toggle(key.id, key.status)}
                      >
                        {key.status === 'active' ? m.keys.disable : m.keys.enable}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={m.keys.removeAria(key.preview)}
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
            {m.keys.empty}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The empty state on the rail: the one thing standing between you and a run.
 *
 * It is drawn loud on purpose. A first-time contributor arrives without a key
 * and without knowing there is one to get, so this block has to say what is
 * missing, where it comes from and what it costs — before the dialog, not
 * inside it. The quiet version of this box was read as a footnote and skipped.
 */
export function AddFirstKey({ keys }: { keys: KeySummary[] }) {
  const m = useMessages()

  return (
    <div className="border-primary/40 bg-primary/5 flex flex-col items-center gap-3 border border-dashed px-4 py-7 text-center">
      <span className="border-primary/50 text-primary flex size-9 items-center justify-center border">
        <KeyRound className="size-4.5" strokeWidth={1.5} />
      </span>

      <p className="font-display text-lg font-medium text-balance">
        {m.keys.firstTitle}
      </p>
      <p className="text-muted-foreground max-w-md text-sm text-pretty">
        {m.keys.firstBody}
      </p>

      <KeysDialog keys={keys}>
        <Button size="lg" className="eyebrow h-11 px-5">
          <KeyRound className="size-4" />
          {m.keys.firstCta}
        </Button>
      </KeysDialog>

      <p className="text-muted-foreground max-w-md text-xs text-pretty">
        {m.keys.firstWhere}
      </p>
    </div>
  )
}
