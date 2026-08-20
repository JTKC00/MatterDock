const FORMULA_LEAD = /^[=+\-@\t\r]/

export function escapeCsvField(value: string, formulaSafe = true): string {
  let text = value
  if (formulaSafe && FORMULA_LEAD.test(text)) {
    text = `'${text}`
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return escapeCsvField(String(value), true)
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const lines = [headers.map((header) => escapeCsvField(header, false)).join(',')]
  for (const row of rows) {
    lines.push(row.map((cell) => csvCell(cell)).join(','))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
