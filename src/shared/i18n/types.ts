export const SUPPORTED_LOCALES = ['en', 'zh-HK'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export type TranslateVars = Record<string, string | number>
