import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { Checkbox } from '#/components/ui/checkbox'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import type { StoredSettings } from '#/lib/generator/settings'
import { useMessages } from '#/lib/i18n'

interface AdvancedOptionsProps {
  settings: StoredSettings
  onChange: (settings: StoredSettings) => void
  disabled: boolean
}

/**
 * The three Shutterstock columns nobody else has to think about.
 *
 * Everything that used to live here is decided elsewhere now: the model and the
 * worker count by the app, the filename written into the CSV by the person on
 * the review screen. An Adobe run needs nothing from this panel, so on Adobe it
 * does not render at all.
 */
export function AdvancedOptions({
  settings,
  onChange,
  disabled,
}: AdvancedOptionsProps) {
  const m = useMessages()
  const [open, setOpen] = useState(false)

  if (settings.platform !== 'shutterstock') return null

  const set = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) =>
    onChange({ ...settings, [key]: value })

  const changed =
    settings.editorial || settings.mature || settings.illustration !== 'auto'

  return (
    <div className="border-(--line) border-t">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 py-3 transition-colors"
      >
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        <span className="eyebrow">{m.options.heading}</span>
        {changed && !open ? (
          <span className="bg-primary size-1.5" aria-label={m.options.changedAria} />
        ) : null}
        <span className="text-muted-foreground/60 ml-auto font-mono text-[0.65rem]">
          editorial · mature · illustration
        </span>
      </button>

      {open ? (
        <div className="space-y-3 pb-5">
          <div className="space-y-2">
            <Label>{m.options.illustration}</Label>
            <Select
              value={settings.illustration}
              disabled={disabled}
              onValueChange={(value) =>
                set('illustration', value as StoredSettings['illustration'])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{m.options.illustrationAuto}</SelectItem>
                <SelectItem value="yes">{m.options.illustrationYes}</SelectItem>
                <SelectItem value="no">{m.options.illustrationNo}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <CheckRow
            id="editorial"
            label={m.options.editorial}
            checked={settings.editorial}
            disabled={disabled}
            onChange={(checked) => set('editorial', checked)}
          />
          <CheckRow
            id="mature"
            label={m.options.mature}
            checked={settings.mature}
            disabled={disabled}
            onChange={(checked) => set('mature', checked)}
          />
        </div>
      ) : null}
    </div>
  )
}

function CheckRow({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label
        htmlFor={id}
        className="text-foreground font-sans text-sm font-normal tracking-normal normal-case"
      >
        {label}
      </Label>
    </div>
  )
}
