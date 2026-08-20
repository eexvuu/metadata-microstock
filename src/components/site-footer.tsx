import { Link } from '@tanstack/react-router'

const LINKS = [
  { to: '/dashboard', label: 'Tools' },
  { to: '/dashboard/generate', label: 'Metadata' },
  { to: '/dashboard/keys', label: 'API keys' },
] as const

/** The colophon — printed small at the bottom of the sheet, like a lab stamp. */
export function SiteFooter() {
  return (
    <footer className="border-(--line) mt-24 border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="eyebrow text-muted-foreground">Stockflow</p>
            <p className="max-w-sm text-sm text-pretty">
              Tools for the people who upload to microstock. Your media stays on
              your machine; the model runs on{' '}
              <span className="text-primary font-mono">your own keys</span>.
            </p>
          </div>

          <ul className="grid gap-2">
            {LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-muted-foreground hover:text-foreground font-mono text-xs transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-(--line) mt-10 flex items-center gap-4 border-t pt-5">
          <span className="perforation h-2 w-20 shrink-0 opacity-70" />
          <p className="eyebrow text-muted-foreground/70">
            Gemma · your keys · your machine
          </p>
        </div>
      </div>
    </footer>
  )
}
