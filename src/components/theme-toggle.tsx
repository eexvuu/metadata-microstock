import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '#/components/ui/button'
import { useMessages } from '#/lib/i18n'

type ThemeMode = 'light' | 'dark' | 'auto'

const MODES: Array<ThemeMode> = ['light', 'dark', 'auto']

const ICONS = {
  light: Sun,
  dark: Moon,
  auto: Monitor,
} satisfies Record<ThemeMode, typeof Sun>

function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
  const root = document.documentElement

  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.style.colorScheme = resolved

  if (mode === 'auto') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }

  localStorage.setItem('theme', mode)
}

export function ThemeToggle() {
  const m = useMessages()

  // Starts as null so the server and the first client render agree — the real
  // mode is only known once localStorage is readable.
  const [mode, setMode] = useState<ThemeMode | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    setMode(
      stored === 'light' || stored === 'dark' || stored === 'auto'
        ? stored
        : 'auto',
    )
  }, [])

  function cycle() {
    const next = MODES[(MODES.indexOf(mode ?? 'auto') + 1) % MODES.length]
    setMode(next)
    applyTheme(next)
  }

  const Icon = ICONS[mode ?? 'auto']
  const label = `${m.header.theme}: ${m.header.themeModes[mode ?? 'auto']}`

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={label}
      title={label}
    >
      <Icon className="size-4" />
    </Button>
  )
}
