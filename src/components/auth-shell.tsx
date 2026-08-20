import { AlertCircle } from 'lucide-react'

/**
 * Shared frame for the sign-in / sign-up / onboarding forms.
 *
 * Deliberately not a Card: the auth screens are the one place with nothing to
 * compete with, so the form gets the full darkroom treatment — safelight
 * behind it, crop marks around it, a sprocket edge down the side.
 */
export function AuthShell({
  title,
  description,
  error,
  children,
  footer,
}: {
  title: string
  description: string
  error?: string | null
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="safelight sheet-grid relative flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-16">
      <div className="relative w-full max-w-sm">
        <span className="sprockets absolute -top-3 -bottom-3 -left-5 hidden w-2 opacity-60 sm:block" />

        <div className="border-(--line) bg-card/90 crop-marks border p-7 backdrop-blur-sm">
          <p className="eyebrow text-primary">Stockflow · tools</p>

          <h1 className="font-display mt-4 text-3xl leading-tight font-light tracking-tight">
            {title}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm text-pretty">
            {description}
          </p>

          <div className="border-(--line) mt-6 border-t pt-6">
            {error ? (
              <div
                role="alert"
                className="border-destructive/40 bg-destructive/10 text-destructive mb-5 flex items-start gap-2 border-l-2 py-2 pr-3 pl-3 text-sm"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span className="text-pretty">{error}</span>
              </div>
            ) : null}

            {children}
          </div>

          {footer ? (
            <div className="border-(--line) text-muted-foreground mt-6 border-t pt-4 text-center font-mono text-xs">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
