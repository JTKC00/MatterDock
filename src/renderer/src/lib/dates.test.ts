import { describe, expect, it } from 'vitest'
import { formatDateTime, formatRelativeDate } from './dates'

describe('formatRelativeDate', () => {
  it('describes today and yesterday', () => {
    const now = new Date('2026-08-15T12:00:00')
    expect(formatRelativeDate('2026-08-15T08:00:00', now)).toBe('Updated today')
    expect(formatRelativeDate('2026-08-14T22:00:00', now)).toBe('Updated yesterday')
    expect(formatDateTime('2026-08-15T08:00:00')).toContain('Aug 2026')
  })
})
