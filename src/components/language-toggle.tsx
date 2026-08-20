import { Languages } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { LOCALES, useLocale, useMessages } from '#/lib/i18n'

/**
 * Sits next to the theme toggle, and works the same way: a preference of the
 * browser, stored in the browser. It changes the pages only — the metadata a
 * run writes is English whatever this says.
 */
export function LanguageToggle() {
  const { locale, setLocale } = useLocale()
  const m = useMessages()
  const current = LOCALES.find((entry) => entry.code === locale)!

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="eyebrow gap-1.5 px-2"
          aria-label={`${m.header.language}: ${current.name}`}
          title={`${m.header.language}: ${current.name}`}
        >
          <Languages className="size-4" />
          {current.short}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        {LOCALES.map((entry) => (
          <DropdownMenuItem
            key={entry.code}
            onSelect={() => setLocale(entry.code)}
            className={entry.code === locale ? 'text-primary' : undefined}
          >
            <span className="text-muted-foreground w-6 font-mono text-[0.65rem]">
              {entry.short}
            </span>
            {entry.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
