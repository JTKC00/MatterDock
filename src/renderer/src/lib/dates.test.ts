import { afterEach, describe, expect, it } from 'vitest'
import { setActiveLocale } from '@/i18n/runtime'
import {
  formatDateTime,
  formatRelativeDate,
  fromOptionalDatetimeLocal,
  fromRequiredDatetimeLocal,
  InvalidDatetimeError
} from './dates'

afterEach(() => {
  setActiveLocale('en')
})

describe('formatRelativeDate', () => {
  it('describes today and yesterday', () => {
    const now = new Date('2026-08-15T12:00:00')
    expect(formatRelativeDate('2026-08-15T08:00:00', now)).toBe('Updated today')
    expect(formatRelativeDate('2026-08-14T22:00:00', now)).toBe('Updated yesterday')
    expect(formatDateTime('2026-08-15T08:00:00')).toMatch(/Aug.*2026/)
  })

  it('formats relative dates and calendar dates in zh-HK', () => {
    setActiveLocale('zh-HK')
    const now = new Date('2026-08-15T12:00:00')
    expect(formatRelativeDate('2026-08-15T08:00:00', now)).toBe('今日已更新')
    expect(formatRelativeDate('2026-08-14T22:00:00', now)).toBe('昨日已更新')
    expect(formatDateTime('2026-08-15T08:00:00')).toMatch(/2026年8月15日/)
  })
})

describe('datetime local conversion', () => {
  it('does not invent the current time for empty or invalid values', () => {
    expect(fromOptionalDatetimeLocal('')).toBeNull()
    expect(fromOptionalDatetimeLocal('   ')).toBeNull()
    expect(() => fromOptionalDatetimeLocal('not-a-date')).toThrow(InvalidDatetimeError)
    expect(() => fromRequiredDatetimeLocal('')).toThrow(/required/i)
    expect(() => fromRequiredDatetimeLocal('not-a-date')).toThrow(/valid date/i)
    const parsed = fromRequiredDatetimeLocal('2026-08-15T10:30')
    expect(parsed).not.toBe(new Date().toISOString())
    expect(new Date(parsed).getFullYear()).toBe(2026)
  })
})
