import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { AuthShell } from '#/components/auth-shell'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { signIn } from '#/lib/auth-client'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    setPending(true)
    setError(null)

    const { error: signInError } = await signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })

    if (signInError) {
      setPending(false)
      setError(signInError.message ?? 'Could not sign in.')
      return
    }

    await navigate({ to: '/dashboard' })
  }

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back. Use the account you signed up with."
      error={error}
      footer={
        <span>
          Need an account?{' '}
          <Link to="/signup" className="text-foreground font-medium underline-offset-4 hover:underline">
            Sign up
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
