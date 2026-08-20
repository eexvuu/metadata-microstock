import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { en } from './en'
import type { Messages } from './en'
import { id } from './id'

export type { Messages }

export type Locale = 'en' | 'id'

const DICTIONARIES: Record<Locale, Messages> = { en, id }

/** The switcher's own list — code, the two letters on the button, the name. */
export const LOCALES = [
  { code: 'en', short: 'EN', name: 'English', tag: 'en-US' },
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia', tag: 'id-ID' },
] as const satisfies ReadonlyArray<{
  code: Locale
  short: string
  name: string
  tag: string
}>

const STORAGE_KEY = 'locale'

interface LocaleState {
  locale: Locale
  /** For `toLocaleString` — the same choice, in the form `Intl` wants. */
  tag: string
  setLocale: (next: Locale) => void
}

const LocaleContext = createContext<LocaleState>({
  locale: 'en',
  tag: 'en-US',
  setLocale: () => {},
})

/**
 * Language for the pages — not for the tool's output.
 *
 * The first render is always English, in every environment, because the
 * prerendered shell and the first client render have to agree; the stored
 * choice is read after mount. That is one frame of English for an Indonesian
 * reader, and the same trade `ThemeToggle` already makes. The alternative is a
 * cookie the Worker reads, which would put rendering work back on a request
 * path the free tier gives 10 ms.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setStored] = useState<Locale>('en')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'id') setStored(saved)
  }, [])

  // `<html lang>` is server-rendered as English; correct it once we know.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<LocaleState>(
    () => ({
      locale,
      tag: LOCALES.find((entry) => entry.code === locale)!.tag,
      setLocale: (next) => {
        localStorage.setItem(STORAGE_KEY, next)
        setStored(next)
      },
    }),
    [locale],
  )

  return <LocaleContext value={value}>{children}</LocaleContext>
}

/** The current language and how to change it. */
export function useLocale() {
  return useContext(LocaleContext)
}

/** The copy for the current language, fully typed — `m.nav.history`. */
export function useMessages(): Messages {
  return DICTIONARIES[useContext(LocaleContext).locale]
}
