import { describe, expect, it } from 'vitest'
import { isBlank, normalizeAlias, normalizeMultilineText, normalizeWhitespace, optionalText } from './normalize'

describe('normalizeAlias', () => {
  it('trims, collapses whitespace, and lowercases Latin text', () => {
    expect(normalizeAlias('  China   Light & Power  ')).toBe('china light & power')
    expect(normalizeAlias('CLP')).toBe('clp')
  })

  it('preserves CJK characters while still trimming', () => {
    expect(normalizeAlias('  中電  ')).toBe('中電')
    expect(normalizeAlias('中華  電力')).toBe('中華 電力')
  })

  it('treats whitespace-only values as empty', () => {
    expect(normalizeAlias('   \t  ')).toBe('')
    expect(isBlank('   ')).toBe(true)
  })
})

describe('optionalText', () => {
  it('returns null for blank input', () => {
    expect(optionalText('')).toBeNull()
    expect(optionalText('   ')).toBeNull()
    expect(optionalText(null)).toBeNull()
  })

  it('normalizes stored text', () => {
    expect(optionalText('  Case   officer ')).toBe('Case officer')
    expect(normalizeWhitespace('  a   b  ')).toBe('a b')
  })
})

describe('normalizeMultilineText', () => {
  it('preserves intentional line breaks and lists', () => {
    const input = 'Called Ms Chan.\n\nDocuments required:\n- Salary record\n- MPF statement\n- Payment proof'
    expect(normalizeMultilineText(input)).toBe(input)
  })

  it('normalizes Windows newlines and trailing spaces, and returns null when blank', () => {
    expect(normalizeMultilineText('Line 1  \r\n\r\nLine 2  \r\n- A  ')).toBe('Line 1\n\nLine 2\n- A')
    expect(normalizeMultilineText('   \n\n  ')).toBeNull()
    expect(normalizeMultilineText(null)).toBeNull()
  })
})
