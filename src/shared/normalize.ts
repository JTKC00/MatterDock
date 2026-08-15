/** Deterministic alias / name normalization. No fuzzy or AI matching. */
export function normalizeAlias(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
}

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0
}

export function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = normalizeWhitespace(value)
  return trimmed.length === 0 ? null : trimmed
}
