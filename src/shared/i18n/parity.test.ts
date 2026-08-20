import { describe, expect, it } from 'vitest'
import { STATUS_LABELS } from '../types'
import { detectFromTag, isSupportedLocale, parseSavedLocale } from './detect'
import { translateError } from './errors'
import { interpolate, messageKeys, translate } from './translate'

describe('locale detection', () => {
  it('maps Hong Kong and Traditional Chinese tags to zh-HK', () => {
    expect(detectFromTag('zh-HK')).toBe('zh-HK')
    expect(detectFromTag('zh-Hant')).toBe('zh-HK')
    expect(detectFromTag('zh-TW')).toBe('zh-HK')
    expect(detectFromTag('zh_HK')).toBe('zh-HK')
    expect(detectFromTag('en-US')).toBe('en')
    expect(detectFromTag('zh-CN')).toBe('en')
    expect(detectFromTag(undefined)).toBe('en')
  })

  it('rejects invalid saved locales', () => {
    expect(parseSavedLocale('zh-HK')).toBe('zh-HK')
    expect(parseSavedLocale('en')).toBe('en')
    expect(parseSavedLocale('fr')).toBeNull()
    expect(parseSavedLocale(null)).toBeNull()
    expect(parseSavedLocale('invalid')).toBeNull()
    expect(isSupportedLocale('zh-HK')).toBe(true)
    expect(isSupportedLocale('zh-CN')).toBe(false)
  })
})

describe('translation resources', () => {
  it('keeps English and zh-HK keys in parity', () => {
    expect(messageKeys('zh-HK')).toEqual(messageKeys('en'))
  })

  it('falls back to English when a key is missing from the active table', () => {
    expect(translate('zh-HK', 'nav.today')).toBe('今日')
    expect(translate('en', 'nav.today')).toBe('Today')
  })

  it('interpolates values', () => {
    expect(interpolate('{count} matters', { count: 3 })).toBe('3 matters')
    expect(translate('zh-HK', 'matters.countMany', { count: 3 })).toBe('3 個事項')
  })

  it('uses English fallback for unknown keys only after looking up English', () => {
    expect(translate('en', 'nav.matters')).toBe('Matters')
    expect(translate('zh-HK', 'nav.matters')).toBe('事項')
  })

  it('uses Hong Kong glossary terms', () => {
    expect(translate('zh-HK', 'nav.today')).toBe('今日')
    expect(translate('zh-HK', 'nav.matters')).toBe('事項')
    expect(translate('zh-HK', 'nav.waiting')).toBe('等待中')
    expect(translate('zh-HK', 'work.nextAction')).toBe('下一步行動')
    expect(translate('zh-HK', 'work.openItems')).toBe('未完成項目')
  })

  it('translates errors from language-independent codes', () => {
    expect(translateError('zh-HK', 'BACKUP_MANAGED_MISSING', 'fallback')).toBe(
      translate('zh-HK', 'errors.backupManagedMissing')
    )
    expect(translateError('en', 'FILE_UNAVAILABLE', 'fallback')).toBe(translate('en', 'errors.fileUnavailable'))
    expect(translateError('zh-HK', 'UNKNOWN_CODE', 'keep fallback')).toBe('keep fallback')
  })

  it('does not localise stored matter status enums', () => {
    expect(STATUS_LABELS.waiting).toBe('Waiting')
    expect(STATUS_LABELS.archived).toBe('Archived')
    expect(translate('zh-HK', 'status.waiting')).toBe('等待中')
  })
})
