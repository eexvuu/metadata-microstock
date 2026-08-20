import { z } from 'zod'

import type { PanelField } from '#/lib/panel/types'

/**
 * Turns field metadata into a Zod schema.
 *
 * Runs on BOTH sides: the dialog validates with it before submitting, and the
 * server function validates with it again before touching the database. One
 * declaration, two enforcement points, no drift — the same deal the rest of
 * the kit makes with `projectSearchSchema`, generalised.
 */
export function buildFormSchema(fields: PanelField[], mode: 'create' | 'update') {
  const shape: Record<string, z.ZodType> = {}

  for (const field of fields) {
    if (!field.on[mode]) continue
    shape[field.name] = fieldSchema(field, mode)
  }

  return z.object(shape)
}

function fieldSchema(field: PanelField, mode: 'create' | 'update'): z.ZodType {
  /** On edit every field is optional — the dialog sends a partial patch. */
  const optional = !field.required || mode === 'update'

  switch (field.kind) {
    case 'number': {
      let schema = z.coerce.number()
      if (field.min !== undefined) schema = schema.min(field.min)
      if (field.max !== undefined) schema = schema.max(field.max)
      return optional ? schema.optional() : schema
    }

    case 'switch':
      return optional ? z.boolean().optional() : z.boolean()

    case 'select': {
      const values = (field.options ?? []).map((option) => option.value)
      const schema = z.string().refine((value) => values.includes(value), {
        message: `Must be one of: ${values.join(', ')}`,
      })
      return optional ? schema.optional() : schema
    }

    case 'date': {
      const schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker')
      return optional ? schema.optional().or(z.literal('')) : schema
    }

    default: {
      let schema = z.string()
      /**
       * `optional` above already allows an ABSENT key, which is what makes an
       * edit a patch. A present-but-empty value is a different thing: clearing
       * a required field has to fail, or the update silently no-ops and the
       * success toast lies.
       */
      if (field.required) {
        schema = schema.min(1, `${field.label} is required`)
      }
      if (field.max !== undefined) {
        schema = schema.max(field.max, `At most ${field.max} characters`)
      }
      return optional ? schema.optional() : schema
    }
  }
}

/** The blank form state for a create dialog, from each field's default. */
export function emptyValues(fields: PanelField[], mode: 'create' | 'update') {
  const values: Record<string, unknown> = {}

  for (const field of fields) {
    if (!field.on[mode]) continue
    values[field.name] =
      field.defaultValue ?? (field.kind === 'switch' ? false : '')
  }

  return values
}
