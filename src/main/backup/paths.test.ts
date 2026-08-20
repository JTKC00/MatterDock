import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { USER_ERRORS } from '@shared/errors'
import { archiveEntryDestination, classifyBackupEntry, isUnsafeArchivePath } from './paths'

const uuid = '550e8400-e29b-41d4-a716-446655440000'

describe('backup archive paths', () => {
  it('allows the strict MatterDock backup whitelist', () => {
    expect(classifyBackupEntry('manifest.json')).toBe('manifest')
    expect(classifyBackupEntry('database.sqlite')).toBe('database')
    expect(classifyBackupEntry('documents/')).toBe('directory')
    expect(classifyBackupEntry(`documents/${uuid}/`)).toBe('directory')
    expect(classifyBackupEntry(`documents/${uuid}/letter.pdf`)).toBe('document-file')
  })

  it('rejects traversal, absolute, extra and duplicate-style unsafe names', () => {
    expect(isUnsafeArchivePath('../outside.txt')).toBe(true)
    expect(isUnsafeArchivePath('documents/../../outside.txt')).toBe(true)
    expect(isUnsafeArchivePath('C:\\evil.txt')).toBe(true)
    expect(isUnsafeArchivePath('/tmp/evil.txt')).toBe(true)
    expect(isUnsafeArchivePath('\\\\server\\share\\evil.txt')).toBe(true)
    expect(() => classifyBackupEntry('random.exe')).toThrow(USER_ERRORS.backupInvalid)
    expect(() => classifyBackupEntry(`documents/${uuid}/nested/file.pdf`)).toThrow(USER_ERRORS.backupInvalid)
    expect(() => classifyBackupEntry('documents/not-a-uuid/file.pdf')).toThrow(USER_ERRORS.backupInvalid)
  })

  it('never resolves an archive path outside the staging root', () => {
    const root = mkdtempSync(join(tmpdir(), 'matterdock-zip-root-'))
    try {
      expect(() => archiveEntryDestination(root, '../outside.txt')).toThrow(USER_ERRORS.backupInvalid)
      const inside = archiveEntryDestination(root, `documents/${uuid}/letter.pdf`)
      expect(inside.startsWith(root)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
