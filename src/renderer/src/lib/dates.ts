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
