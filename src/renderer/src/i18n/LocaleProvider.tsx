import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import type { SupportedLocale, TranslateVars } from '@shared/i18n'
import { api } from '@/lib/api'
import { getActiveLocale, setActiveLocale, t as translateActive } from './runtime'

type LocaleContextValue = {
  locale: SupportedLocale
  setLocale: (locale: SupportedLocale) => Promise<void>
  t: (key: string, vars?: TranslateVars) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({
  locale,
  onLocaleChange,
  children
}: {
  locale: SupportedLocale
  onLocaleChange: (locale: SupportedLocale) => void
  children: ReactNode
}) {
  useEffect(() => {
    setActiveLocale(locale)
    document.documentElement.lang = locale === 'zh-HK' ? 'zh-HK' : 'en'
  }, [locale])

  const setLocale = useCallback(
    async (next: SupportedLocale) => {
      setActiveLocale(next)
      onLocaleChange(next)
      await api.settings.setLocale(next)
    },
    [onLocaleChange]
  )

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: string, vars?: TranslateVars) => translateActive(key, vars)
    }),
    [locale, setLocale]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext)
  if (!value) {
    return {
      locale: getActiveLocale(),
      setLocale: async () => undefined,
      t: (key, vars) => translateActive(key, vars)
    }
  }
  return value
}

export function useT(): (key: string, vars?: TranslateVars) => string {
  return useLocale().t
}
