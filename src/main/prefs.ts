import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { detectFromTag, parseSavedLocale, type SupportedLocale } from '@shared/i18n'

export type AppPreferences = {
  locale: SupportedLocale
}

export function preferencesPath(userData: string): string {
  return join(userData, 'settings.json')
}

export function readPreferences(userData: string, osLocale?: string): AppPreferences {
  const path = preferencesPath(userData)
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { locale?: unknown }
      const locale = parseSavedLocale(parsed.locale)
      if (locale) return { locale }
    } catch (error) {
      console.warn('[matterdock] settings.json could not be read', error)
    }
  }
  const fromEnv = parseSavedLocale(process.env.MATTERDOCK_LOCALE)
  if (fromEnv) return { locale: fromEnv }
  return { locale: detectFromTag(osLocale) }
}

export function writePreferences(userData: string, prefs: AppPreferences): void {
  const path = preferencesPath(userData)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(prefs, null, 2)}\n`, 'utf8')
}
