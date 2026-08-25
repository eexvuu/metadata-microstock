import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'

import { LanguageToggle } from '#/components/language-toggle'
import { CONTAINER } from '#/components/shell'
import { ThemeToggle } from '#/components/theme-toggle'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Skeleton } from '#/components/ui/skeleton'
import { signOut, useSession, useToolsHref } from '#/lib/auth-client'
import { useMessages } from '#/lib/i18n'

/**
 * Site-wide chrome names no single tool. A tool's own screens — its runs, its
 * history — live behind its card on the shelf, so that this nav still fits
 * when the shelf holds six of them.
 */
const NAV = [
  { to: '/', key: 'overview' },
  // `to` is filled in per render: see `useToolsHref`.
  { to: null, key: 'tools' },
] as const

const NAV_LINK =
  'eyebrow text-muted-foreground hover:text-foreground relative py-1 transition-colors after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-[width] after:duration-300 hover:after:w-full'

export function SiteHeader() {
  const m = useMessages()
  const toolsHref = useToolsHref()

  return (
    <header className="bg-background/85 sticky top-0 z-50 w-full backdrop-blur-md">
      {/* The safelight strip: the one saturated line on every screen. */}
      <div className="from-primary/0 via-primary to-primary/0 h-px w-full bg-gradient-to-r" />

      <div className={`${CONTAINER} border-(--line) flex h-16 items-center gap-8 border-b`}>
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="border-foreground/70 group-hover:border-primary relative flex size-6 items-center justify-center border transition-colors">
            <span className="bg-primary size-2" />
            <span className="border-primary absolute -top-0.5 -left-0.5 size-1.5 border-t border-l" />
            <span className="border-primary absolute -right-0.5 -bottom-0.5 size-1.5 border-r border-b" />
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-display text-lg leading-none font-semibold tracking-tight">
              Stockflow
            </span>
            <span className="eyebrow text-muted-foreground">tools</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          {NAV.map((item) => {
            const to = item.to ?? toolsHref

            return (
              <Link
                key={item.key}
                to={to}
                className={NAV_LINK}
                // Standing on /login is not standing on Tools — the link that
                // sent you there does not get to underline itself.
                activeProps={
                  to === '/login'
                    ? {}
                    : { className: 'text-foreground after:w-full' }
                }
                activeOptions={{ exact: to === '/' }}
              >
                {m.nav[item.key]}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}

function AccountMenu() {
  const m = useMessages()
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()

  if (isPending) {
    return <Skeleton className="h-8 w-24 rounded-xs" />
  }

  if (!session) {
    return (
      <>
        <Button asChild variant="ghost" size="sm" className="hidden sm:flex">
          <Link to="/login" className="eyebrow">
            {m.header.signIn}
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/signup" className="eyebrow">
            {m.header.start}
          </Link>
        </Button>
      </>
    )
  }

  const initials =
    session.user.name
      ?.split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={m.header.accountMenu}>
          <Avatar className="border-foreground/25 size-7 rounded-xs border">
            <AvatarFallback className="rounded-xs font-mono text-[0.65rem] tracking-wider">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{session.user.name}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">
            {session.user.email}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={async () => {
            await signOut()
            await navigate({ to: '/login' })
          }}
        >
          <LogOut className="size-4" />
          {m.header.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
