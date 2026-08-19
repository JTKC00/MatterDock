import { describe, expect, it } from 'vitest'
import { attentionReason, isDueToday, isOverdue, isUpcoming, overdueDays } from './day'

const now = new Date(2026, 7, 15, 15, 30, 0)

describe('local day classification', () => {
  it('treats yesterday as overdue', () => {
    const yesterday = new Date(2026, 7, 14, 10, 0, 0).toISOString()
    expect(isOverdue(yesterday, now)).toBe(true)
    expect(isDueToday(yesterday, now)).toBe(false)
    expect(overdueDays(yesterday, now)).toBeGreaterThanOrEqual(1)
  })

  it('treats a due time later today as due today, not overdue', () => {
    const laterToday = new Date(2026, 7, 15, 22, 0, 0).toISOString()
    expect(isDueToday(laterToday, now)).toBe(true)
    expect(isOverdue(laterToday, now)).toBe(false)
  })

  it('treats tomorrow as upcoming', () => {
    const tomorrow = new Date(2026, 7, 16, 9, 0, 0).toISOString()
    expect(isUpcoming(tomorrow, now)).toBe(true)
    expect(isOverdue(tomorrow, now)).toBe(false)
    expect(isDueToday(tomorrow, now)).toBe(false)
  })

  it('does not treat a missing due date as overdue', () => {
    expect(isOverdue(null, now)).toBe(false)
    expect(isDueToday(undefined, now)).toBe(false)
  })

  it('does not treat an invalid due date string as due today or overdue', () => {
    expect(isDueToday('invalid-date', now)).toBe(false)
    expect(isOverdue('invalid-date', now)).toBe(false)
    expect(isUpcoming('invalid-date', now)).toBe(false)
    expect(attentionReason({ dueAt: 'invalid-date' }, now)).toBeNull()
  })
})

describe('attentionReason', () => {
  it('uses overdue, today, urgent, then high priority', () => {
    expect(attentionReason({ dueAt: new Date(2026, 7, 14, 10, 0, 0).toISOString(), priority: 'normal' }, now)).toBe(
      'Overdue'
    )
    expect(attentionReason({ dueAt: new Date(2026, 7, 15, 18, 0, 0).toISOString(), priority: 'high' }, now)).toBe(
      'Today'
    )
    expect(attentionReason({ dueAt: new Date(2026, 7, 16, 9, 0, 0).toISOString(), priority: 'urgent' }, now)).toBe(
      'Urgent'
    )
    expect(attentionReason({ dueAt: null, priority: 'high' }, now)).toBe('High priority')
    expect(attentionReason({ dueAt: new Date(2026, 7, 16, 9, 0, 0).toISOString(), priority: 'normal' }, now)).toBeNull()
  })
})
