import { SUPPORTED_LOCALES, type SupportedLocale } from './types'

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function detectFromTag(tag: string | undefined | null): SupportedLocale {
  const normalised = String(tag ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
  if (
    normalised.startsWith('zh-hk') ||
    normalised.startsWith('zh-hant') ||
    normalised.startsWith('zh-tw') ||
    normalised === 'zh-hant-hk' ||
    normalised === 'zh-hant-tw'
  ) {
    return 'zh-HK'
  }
  return 'en'
}

export function parseSavedLocale(value: unknown): SupportedLocale | null {
  if (!isSupportedLocale(value)) return null
  return value
}
