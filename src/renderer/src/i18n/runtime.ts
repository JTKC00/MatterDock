import { translate, translateError, type SupportedLocale, type TranslateVars } from '@shared/i18n'

let activeLocale: SupportedLocale = 'en'

export function getActiveLocale(): SupportedLocale {
  return activeLocale
}

export function setActiveLocale(locale: SupportedLocale): void {
  activeLocale = locale
}

export function t(key: string, vars?: TranslateVars): string {
  return translate(activeLocale, key, vars)
}

export function tx(code: string | undefined, fallback: string): string {
  return translateError(activeLocale, code, fallback)
}
