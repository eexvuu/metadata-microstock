import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'

import { Input } from '#/components/ui/input'
import { SEARCH_MIN } from '#/lib/panel/search'
import type { PanelReferenceOption } from '#/lib/panel/types'
import { lookupPanelReference } from '#/lib/server/panel'

/**
 * The input for a `reference` field: type an email, pick an account, store its
 * id.
 *
 * **Why it is hand-written.** A combobox is where a project usually reaches for
 * cmdk plus a popover, which is two dependencies and a portal to make an input
 * with a list under it. The behaviour that actually matters here is small —
 * debounce, arrow keys, escape, click-away — and it is written out below.
 *
 * **What it shows and what it submits are different things.** `display` is the
 * label a human reads; `value` is the id the form sends. Typing clears the id
 * on purpose: a box reading "alice@example.com" while the form still holds the
 * previous account is the one failure mode this component must not have.
 */
export function ReferenceInput({
  id,
  resource,
  field,
  value,
  placeholder,
  invalid,
  onChange,
}: {
  id: string
  resource: string
  field: string
  value: unknown
  placeholder?: string
  invalid?: boolean
  onChange: (value: string) => void
}) {
  const current = typeof value === 'string' ? value : ''

  const [display, setDisplay] = useState('')
  const [options, setOptions] = useState<PanelReferenceOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  /** What the box is showing the label FOR — so a resolve runs once per id. */
  const resolved = useRef<string | null>(null)

  /**
   * An edit dialog opens holding an id and nothing else. Turn it into the
   * label it stands for, once, rather than showing somebody a UUID.
   */
  useEffect(() => {
    if (!current || resolved.current === current) return

    resolved.current = current
    let live = true

    void lookupPanelReference({ data: { resource, field, value: current } })
      .then((hits) => {
        if (live && hits[0]) setDisplay(hits[0].label)
      })
      .catch(() => {})

    return () => {
      live = false
    }
  }, [current, resource, field])

  /** Debounced, because this runs on a keystroke and hits the database. */
  useEffect(() => {
    if (!open) return

    const term = display.trim()
    if (term.length < SEARCH_MIN) {
      setOptions([])
      return
    }

    let live = true
    setLoading(true)

    const timer = setTimeout(() => {
      void lookupPanelReference({ data: { resource, field, q: term } })
        .then((hits) => {
          if (!live) return
          setOptions(hits)
          setHighlight(0)
        })
        .catch(() => live && setOptions([]))
        .finally(() => live && setLoading(false))
    }, 200)

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [display, open, resource, field])

  /** A click outside is a dismissal, not a selection. */
  useEffect(() => {
    if (!open) return

    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  function choose(option: PanelReferenceOption) {
    resolved.current = option.value
    setDisplay(option.label)
    onChange(option.value)
    setOpen(false)
  }

  function clear() {
    resolved.current = null
    setDisplay('')
    onChange('')
    setOptions([])
  }

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Input
          id={id}
          value={display}
          autoComplete="off"
          aria-invalid={invalid}
          aria-expanded={open}
          role="combobox"
          placeholder={placeholder}
          className={current ? 'pr-9' : undefined}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setDisplay(event.target.value)
            setOpen(true)
            // Typing means the old choice is no longer what is shown.
            if (current) onChange('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setHighlight((at) => Math.min(at + 1, options.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlight((at) => Math.max(at - 1, 0))
            } else if (event.key === 'Enter' && open && options[highlight]) {
              // Only swallow Enter when it is choosing something — otherwise it
              // still submits the form, which is what a keyboard expects.
              event.preventDefault()
              choose(options[highlight])
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
        />

        {current ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {open && display.trim().length >= SEARCH_MIN ? (
        <div className="border-(--line) bg-card absolute z-50 mt-1 w-full border shadow-sm">
          {loading && options.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 px-3 py-2 font-mono text-xs">
              <Loader2 className="size-3 animate-spin" />
              searching…
            </p>
          ) : options.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2 font-mono text-xs">
              no match
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto py-1">
              {options.map((option, at) => (
                <li key={option.value}>
                  <button
                    type="button"
                    // mousedown, not click: the input's blur would close the
                    // list before a click ever landed.
                    onMouseDown={(event) => {
                      event.preventDefault()
                      choose(option)
                    }}
                    onMouseEnter={() => setHighlight(at)}
                    className={`flex w-full flex-col items-start px-3 py-1.5 text-left text-sm ${
                      at === highlight ? 'bg-muted' : ''
                    }`}
                  >
                    <span>{option.label}</span>
                    {option.detail ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {option.detail}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
