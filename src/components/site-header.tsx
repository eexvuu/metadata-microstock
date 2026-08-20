import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'

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
import { signOut, useSession } from '#/lib/auth-client'

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/dashboard', label: 'Tools' },
  { to: '/dashboard/keys', label: 'Keys' },
] as const

const NAV_LINK =
  'eyebrow text-muted-foreground hover:text-foreground relative py-1 transition-colors after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-[width] after:duration-300 hover:after:w-full'

export function SiteHeader() {
  return (
    <header className="bg-background/85 sticky top-0 z-50 w-full backdrop-blur-md">
      {/* The safelight strip: the one saturated line on every screen. */}
      <div className="from-primary/0 via-primary to-primary/0 h-px w-full bg-gradient-to-r" />

      <div className="border-(--line) mx-auto flex h-16 w-full max-w-6xl items-center gap-8 border-b px-4 sm:px-6">
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
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={NAV_LINK}
              activeProps={{ className: 'text-foreground after:w-full' }}
              activeOptions={{ exact: item.to === '/' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}

function AccountMenu() {
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
            Sign in
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/signup" className="eyebrow">
            Start
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
        <Button variant="ghost" size="icon" aria-label="Account menu">
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
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
