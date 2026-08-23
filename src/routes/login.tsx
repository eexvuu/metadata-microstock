import { createFileRoute, redirect, useSearch } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { AuthShell } from '#/components/auth-shell'
import { Button } from '#/components/ui/button'
import { signIn } from '#/lib/auth-client'
import { useMessages } from '#/lib/i18n'
import { hasSession } from '#/lib/server/signed-in'

/**
 * The only way in.
 *
 * There is no form here and no `/signup` counterpart doing anything different:
 * a first Google sign-in creates the account, so the two pages are the same
 * page and `/signup` renders this one.
 */
export const Route = createFileRoute('/login')({
  /**
   * Already signed in? There is nothing here for you — the button would only
   * hand back the session you are holding. Straight to the shelf.
   */
  beforeLoad: async () => {
    if (await hasSession()) throw redirect({ to: '/dashboard' })
  },
  /**
   * `?error=` is where Better Auth lands a refused sign-in — see `onAPIError`
   * in src/lib/auth.ts. Validated rather than read raw, because it is a value
   * from the URL bar and it ends up on the page.
   */
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    // Built conditionally rather than `{ error: undefined }`: the key has to be
    // genuinely optional, or every Link to /login in the app is forced to pass
    // a search object it has no opinion about.
    typeof search.error === 'string' ? { error: search.error } : {},
  component: LoginPage,
})

/** Google's mark, inline. A remote asset on the sign-in page is a dependency. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
      />
    </svg>
  )
}

export function GoogleSignIn({ code }: { code?: string }) {
  const m = useMessages()
  const [failed, setFailed] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  /**
   * Resolved during render, not captured into state. First render is always
   * English here — the stored language lands after mount, the same trade
   * ThemeToggle makes — so a message read once at mount stays English on an
   * Indonesian page forever.
   */
  const error =
    failed ?? (code ? (m.auth.errors[code] ?? m.auth.errors.fallback) : null)

  const start = async () => {
    setPending(true)
    setFailed(null)

    const { error: signInError } = await signIn.social({
      provider: 'google',
      callbackURL: '/dashboard',
    })

    // On success the browser has already left for Google, so reaching here at
    // all means it did not.
    if (signInError) {
      setPending(false)
      setFailed(signInError.message ?? m.auth.googleFailed)
    }
  }

  return (
    <AuthShell
      title={m.auth.signInTitle}
      description={m.auth.signInDescription}
      error={error}
      footer={<span>{m.auth.keysNote}</span>}
    >
      <div className="grid gap-4">
        <Button
          type="button"
          onClick={start}
          disabled={pending}
          variant="outline"
          className="w-full"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />}
          {pending ? m.auth.googlePending : m.auth.google}
        </Button>

        <p className="text-muted-foreground text-xs leading-relaxed">
          {m.auth.whyGoogle}
        </p>
      </div>
    </AuthShell>
  )
}

function LoginPage() {
  const { error } = useSearch({ from: '/login' })
  return <GoogleSignIn code={error} />
}
