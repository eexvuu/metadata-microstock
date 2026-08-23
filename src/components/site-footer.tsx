import { Link } from '@tanstack/react-router'

import { CONTAINER } from '#/components/shell'
import { useMessages } from '#/lib/i18n'

const LINKS = [
  { to: '/', key: 'overview' },
  { to: '/dashboard', key: 'tools' },
] as const

/** The colophon — printed small at the bottom of the sheet, like a lab stamp. */
export function SiteFooter() {
  const m = useMessages()

  return (
    <footer className="border-(--line) mt-24 border-t">
      <div className={`${CONTAINER} py-10`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="eyebrow text-muted-foreground">Stockflow</p>
            <p className="max-w-sm text-sm text-pretty">{m.footer.blurb}</p>
          </div>

          <ul className="grid gap-2">
            {LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-muted-foreground hover:text-foreground font-mono text-xs transition-colors"
                >
                  {m.nav[link.key]}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-(--line) mt-10 flex items-center gap-4 border-t pt-5">
          <span className="perforation h-2 w-20 shrink-0 opacity-70" />
          <p className="eyebrow text-muted-foreground/70">{m.footer.stamp}</p>
        </div>
      </div>
    </footer>
  )
}
