export function startOfLocalDay(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function localDayKey(value: Date | string, now = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  void now
  const year = local.getFullYear()
  const month = String(local.getMonth() + 1).padStart(2, '0')
  const day = String(local.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function compareLocalDay(dueAt: string, now = new Date()): number {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return Number.NaN
  return startOfLocalDay(due).getTime() - startOfLocalDay(now).getTime()
}

export function isOverdue(dueAt: string | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false
  return compareLocalDay(dueAt, now) < 0
}

export function isDueToday(dueAt: string | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false
  return compareLocalDay(dueAt, now) === 0
}

export function isUpcoming(dueAt: string | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false
  return compareLocalDay(dueAt, now) > 0
}

export function overdueDays(dueAt: string, now = new Date()): number {
  return Math.max(1, Math.round(-compareLocalDay(dueAt, now) / 86_400_000))
}

export type AttentionReason = 'Overdue' | 'Today' | 'Urgent' | 'High priority'

export function attentionReason(
  item: { dueAt?: string | null; priority?: 'low' | 'normal' | 'high' | 'urgent' },
  now = new Date()
): AttentionReason | null {
  if (isOverdue(item.dueAt, now)) return 'Overdue'
  if (isDueToday(item.dueAt, now)) return 'Today'
  if (item.priority === 'urgent') return 'Urgent'
  if (item.priority === 'high') return 'High priority'
  return null
}
