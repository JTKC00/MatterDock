import { en } from './locales/en'
import { zhHK } from './locales/zh-HK'
import type { SupportedLocale, TranslateVars } from './types'

export type MessageTree = typeof en

function flatten(tree: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, path))
    } else if (typeof value === 'string') {
      out[path] = value
    }
  }
  return out
}

const tables: Record<SupportedLocale, Record<string, string>> = {
  en: flatten(en),
  'zh-HK': flatten(zhHK)
}

export function messageKeys(locale: SupportedLocale = 'en'): string[] {
  return Object.keys(tables[locale]).sort()
}

export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template
  let text = template
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${key}}`, String(value))
  }
  return text
}

export function translate(locale: SupportedLocale, key: string, vars?: TranslateVars): string {
  const table = tables[locale] ?? tables.en
  const raw = table[key] ?? tables.en[key]
  if (raw == null) {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn(`[matterdock] missing translation key: ${key}`)
    }
    return interpolate(key, vars)
  }
  return interpolate(raw, vars)
}

export { flatten }
