import { isDueToday, isOverdue, overdueDays } from '@shared/day'
import { t } from '@/i18n/runtime'
import { formatDateTime } from '@/lib/dates'

export function dueLabel(dueAt: string | null | undefined, now = new Date(), waiting = false): string | null {
  if (!dueAt) return null
  if (isOverdue(dueAt, now)) {
    const days = overdueDays(dueAt, now)
    return days === 1 ? t('due.overdueDay', { days }) : t('due.overdueDays', { days })
  }
  if (isDueToday(dueAt, now)) return waiting ? t('due.followUpToday') : t('due.dueToday')
  return waiting ? t('due.followUpOn', { date: formatDateTime(dueAt) }) : t('due.dueOn', { date: formatDateTime(dueAt) })
}
