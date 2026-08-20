import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { AuthShell } from '#/components/auth-shell'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { signUp } from '#/lib/auth-client'
import { useMessages } from '#/lib/i18n'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

function SignupPage() {
  const m = useMessages()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    setPending(true)
    setError(null)

    const { error: signUpError } = await signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
    })

    if (signUpError) {
      setPending(false)
      setError(signUpError.message ?? m.auth.signUpFailed)
      return
    }

    await navigate({ to: '/dashboard' })
  }

  return (
    <AuthShell
      title={m.auth.signUpTitle}
      description={m.auth.signUpDescription}
      error={error}
      footer={
        <span>
          {m.auth.haveAccount}{' '}
          <Link to="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
            {m.auth.signInLink}
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">{m.auth.name}</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder={m.auth.namePlaceholder}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email">{m.auth.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={m.auth.emailPlaceholder}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">{m.auth.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="text-muted-foreground text-xs">{m.auth.passwordHint}</p>
        </div>

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? m.auth.signUpPending : m.auth.signUpSubmit}
        </Button>
      </form>
    </AuthShell>
  )
}
