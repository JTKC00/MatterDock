import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readPreferences, writePreferences } from './prefs'

const dirs: string[] = []

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('application preferences', () => {
  it('persists an explicit locale and ignores invalid saved values', () => {
    const userData = mkdtempSync(join(tmpdir(), 'matterdock-prefs-'))
    dirs.push(userData)
    expect(readPreferences(userData, 'en-US').locale).toBe('en')
    writePreferences(userData, { locale: 'zh-HK' })
    expect(readPreferences(userData, 'en-US').locale).toBe('zh-HK')
    writeFileSync(join(userData, 'settings.json'), '{not json')
    expect(readPreferences(userData, 'zh-HK').locale).toBe('zh-HK')
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ locale: 'fr' }))
    expect(readPreferences(userData, 'en-GB').locale).toBe('en')
  })

  it('uses OS Traditional Chinese locale when no preference is saved', () => {
    const userData = mkdtempSync(join(tmpdir(), 'matterdock-prefs-os-'))
    dirs.push(userData)
    const previous = process.env.MATTERDOCK_LOCALE
    delete process.env.MATTERDOCK_LOCALE
    try {
      expect(readPreferences(userData, 'zh-HK').locale).toBe('zh-HK')
      expect(readPreferences(userData, 'zh-Hant-HK').locale).toBe('zh-HK')
      expect(readPreferences(userData, 'zh-CN').locale).toBe('en')
      process.env.MATTERDOCK_LOCALE = 'zh-HK'
      expect(readPreferences(userData, 'en-US').locale).toBe('zh-HK')
    } finally {
      if (previous === undefined) delete process.env.MATTERDOCK_LOCALE
      else process.env.MATTERDOCK_LOCALE = previous
    }
  })
})
