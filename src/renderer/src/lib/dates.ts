const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatRelativeDate(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const deltaDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (deltaDays === 0) return 'Updated today'
  if (deltaDays === -1) return 'Updated yesterday'
  if (deltaDays > -7 && deltaDays < 0) return `Updated ${Math.abs(deltaDays)} days ago`
  return `Updated ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

export function formatDayHeading(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const deltaDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (deltaDays === 0) return 'Today'
  if (deltaDays === -1) return 'Yesterday'
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
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
  constructor(message = 'Enter a valid date and time.') {
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
    throw new InvalidDatetimeError('Date and time are required.')
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new InvalidDatetimeError()
  return date.toISOString()
}
