import { describe, expect, it } from 'vitest'
import { escapeCsvField, toCsv } from './csv'

describe('CSV export safety', () => {
  it('quotes commas, quotes, newlines and preserves Unicode', () => {
    const csv = toCsv(
      ['title', 'notes'],
      [
        ['EMPF, subsidy', 'He said "yes"'],
        ['地政總署', 'line1\nline2'],
        ['=1+1', '+cmd']
      ]
    )
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"EMPF, subsidy"')
    expect(csv).toContain('"He said ""yes"""')
    expect(csv).toContain('地政總署')
    expect(csv).toContain('"line1\nline2"')
    expect(csv).toContain("'=1+1")
    expect(csv).toContain("'+cmd")
  })

  it('prefixes formula-leading values without changing JSON-safe originals', () => {
    expect(escapeCsvField('=cmd|calc')).toBe("'=cmd|calc")
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvField('-1+1')).toBe("'-1+1")
    expect(escapeCsvField('normal')).toBe('normal')
  })
})
