import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ReferenceInput } from '#/components/panel/reference-input'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { buildFormSchema, emptyValues } from '#/lib/panel/form-schema'
import type { PanelField, PanelRecord, PanelResourceMeta } from '#/lib/panel/types'
import { createResource, updateResource } from '#/lib/server/panel'

/**
 * The create/edit dialog for every resource.
 *
 * The same `buildFormSchema` that guards the server function validates here
 * first, so the user gets the error inline and the server never sees a payload
 * it has to reject. Both checks are real — the client one is only there to be
 * fast.
 */
export function ResourceFormDialog({
  meta,
  record,
  open,
  onOpenChange,
}: {
  meta: PanelResourceMeta
  /** null = create. */
  record: PanelRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const mode = record ? 'update' : 'create'
  const fields = meta.fields.filter((field) => field.on[mode])

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  /** Reset whenever the dialog opens, so it never shows the last record. */
  useEffect(() => {
    if (!open) return

    setErrors({})
    setValues(
      record
        ? Object.fromEntries(
            fields.map((field) => [field.name, toInputValue(field, record[field.name])]),
          )
        : emptyValues(meta.fields, mode),
    )
  }, [open, record]) // eslint-disable-line -- resetting on open is the point

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const parsed = buildFormSchema(meta.fields, mode).safeParse(values)

    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '')
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }

    setPending(true)

    try {
      if (record) {
        await updateResource({
          data: { resource: meta.name, id: record.id, data: parsed.data },
        })
      } else {
        await createResource({
          data: { resource: meta.name, data: parsed.data },
        })
      }

      toast.success(record ? `${meta.label} updated` : `${meta.label} created`)
      onOpenChange(false)
      /** Re-runs the route loader, so the table shows the new row. */
      await router.invalidate()
    } catch (error) {
      toast.error(message(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {record ? `Edit ${meta.label.toLowerCase()}` : `New ${meta.label.toLowerCase()}`}
          </DialogTitle>
          <DialogDescription>
            {record
              ? 'Changes are saved to this workspace only.'
              : `Add a ${meta.label.toLowerCase()} to this workspace.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          {fields.map((field) => (
            <div key={field.name} className="grid gap-2">
              <Label htmlFor={`field-${field.name}`}>
                {field.label}
                {field.required ? (
                  <span className="text-muted-foreground"> *</span>
                ) : null}
              </Label>

              <FieldInput
                field={field}
                resource={meta.name}
                value={values[field.name]}
                invalid={Boolean(errors[field.name])}
                onChange={(value) => {
                  setValues((prev) => ({ ...prev, [field.name]: value }))
                  setErrors((prev) => ({ ...prev, [field.name]: '' }))
                }}
              />

              {errors[field.name] ? (
                <p className="text-destructive text-xs">{errors[field.name]}</p>
              ) : field.help ? (
                <p className="text-muted-foreground text-xs">{field.help}</p>
              ) : null}
            </div>
          ))}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : record ? 'Save changes' : `Create ${meta.label.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldInput({
  field,
  resource,
  value,
  invalid,
  onChange,
}: {
  field: PanelField
  /** Only a `reference` field needs it: the lookup is scoped to the resource. */
  resource: string
  value: unknown
  invalid: boolean
  onChange: (value: unknown) => void
}) {
  const id = `field-${field.name}`

  switch (field.kind) {
    case 'reference':
      return (
        <ReferenceInput
          id={id}
          resource={resource}
          field={field.name}
          value={value}
          invalid={invalid}
          placeholder={field.placeholder}
          onChange={onChange}
        />
      )

    case 'textarea':
      return (
        <Textarea
          id={id}
          value={String(value ?? '')}
          aria-invalid={invalid}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )

    case 'select':
      return (
        <Select
          value={String(value ?? '')}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
            <SelectValue placeholder={field.placeholder ?? 'Choose…'} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'switch':
      return (
        <div className="flex h-8 items-center">
          <Checkbox
            id={id}
            checked={Boolean(value)}
            aria-invalid={invalid}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
        </div>
      )

    case 'number':
      return (
        <Input
          id={id}
          type="number"
          value={String(value ?? '')}
          min={field.min}
          max={field.max}
          aria-invalid={invalid}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )

    case 'password':
      return (
        <Input
          id={id}
          type="password"
          // A shared credential typed into a laptop in an office. The value is
          // never rendered back — the panel does not select the column it
          // writes to — so this only has to cover the typing.
          autoComplete="new-password"
          value={String(value ?? '')}
          aria-invalid={invalid}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )

    case 'date':
      return (
        <Input
          id={id}
          type="date"
          value={String(value ?? '')}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      )

    default:
      return (
        <Input
          id={id}
          value={String(value ?? '')}
          maxLength={field.max}
          aria-invalid={invalid}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}

/** Row value -> input value. `date` inputs only accept `YYYY-MM-DD`. */
function toInputValue(field: PanelField, value: unknown) {
  if (value === null || value === undefined) {
    return field.kind === 'switch' ? false : ''
  }

  if (field.kind === 'switch') return Boolean(value)

  if (field.kind === 'date') {
    const date = value instanceof Date ? value : new Date(value as string)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  }

  return String(value)
}

export function message(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.'
}
