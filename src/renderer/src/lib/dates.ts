import { getActiveLocale, t } from '@/i18n/runtime'

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function localeTag(): string {
  return getActiveLocale() === 'zh-HK' ? 'zh-HK' : 'en-GB'
}

export function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export function formatRelativeDate(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const deltaDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (deltaDays === 0) return t('matters.updatedToday')
  if (deltaDays === -1) return t('matters.updatedYesterday')
  if (deltaDays > -7 && deltaDays < 0) return t('matters.updatedDaysAgo', { days: Math.abs(deltaDays) })
  return t('matters.updatedOn', { date: formatDisplayDate(date) })
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return formatDisplayDate(date)
}

export function formatDayHeading(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const deltaDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (deltaDays === 0) return t('dates.today')
  if (deltaDays === -1) return t('dates.yesterday')
  return formatDisplayDate(date)
}

export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export class InvalidDatetimeError extends Error {
  constructor(message = t('errors.invalidDatetime')) {
    super(message)
    this.name = 'InvalidDatetimeError'
  }
}

export function fromOptionalDatetimeLocal(value: string | null | undefined): string | null {
  if (value == null || value.trim().length === 0) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new InvalidDatetimeError()
  return date.toISOString()
}

export function fromRequiredDatetimeLocal(value: string | null | undefined): string {
  if (value == null || value.trim().length === 0) {
    throw new InvalidDatetimeError(t('errors.datetimeRequired'))
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new InvalidDatetimeError()
  return date.toISOString()
}
