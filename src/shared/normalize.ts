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

/** Trim ends and line-trailing spaces, keep intentional newlines. Empty → null. */
export function normalizeMultilineText(value: string | null | undefined): string | null {
  if (value == null) return null
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const withoutLineTrail = normalized
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
  return withoutLineTrail.length === 0 ? null : withoutLineTrail
}
