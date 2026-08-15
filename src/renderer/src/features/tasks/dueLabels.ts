import { isDueToday, isOverdue, overdueDays } from '@shared/day'
import { formatDateTime } from '@/lib/dates'

export function dueLabel(dueAt: string | null | undefined, now = new Date(), waiting = false): string | null {
  if (!dueAt) return null
  const prefix = waiting ? 'Follow up' : 'Due'
  if (isOverdue(dueAt, now)) {
    const days = overdueDays(dueAt, now)
    return `Overdue · ${days} ${days === 1 ? 'day' : 'days'}`
  }
  if (isDueToday(dueAt, now)) return `${prefix} today`
  return `${prefix} ${formatDateTime(dueAt)}`
}
