import { describe, expect, it } from 'vitest'
import { selectedContactStillMatches } from './contactSelection'

describe('selectedContactStillMatches', () => {
  it('keeps the selection when the typed text still is that contact', () => {
    expect(selectedContactStillMatches('Ms Chan', 'Ms Chan')).toBe(true)
    expect(selectedContactStillMatches('  Ms Chan  ', 'Ms Chan')).toBe(true)
  })

  it('clears the selection when the user edits the text away from the selected name', () => {
    expect(selectedContactStillMatches('Mr Wong', 'Ms Chan')).toBe(false)
    expect(selectedContactStillMatches('Ms Cha', 'Ms Chan')).toBe(false)
    expect(selectedContactStillMatches('', 'Ms Chan')).toBe(false)
  })
})
