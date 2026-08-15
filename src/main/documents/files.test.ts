import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { USER_ERRORS } from '@shared/errors'
import {
  assertInsideDocumentsRoot,
  copyIntoWorkspace,
  listQuarantineDocumentIds,
  isInsideRoot,
  isStrictlyInsideRoot,
  quarantineName,
  removeManagedDirectory
} from './files'

const uuid = '550e8400-e29b-41d4-a716-446655440000'

describe('document path safety', () => {
  it('rejects paths outside the managed documents root', () => {
    const root = mkdtempSync(join(tmpdir(), 'matterdock-docs-'))
    try {
      expect(isInsideRoot(root, join(root, 'abc', 'file.pdf'))).toBe(true)
      expect(isInsideRoot(root, root)).toBe(true)
      expect(isStrictlyInsideRoot(root, root)).toBe(false)
      expect(isInsideRoot(root, join(root, '..', 'outside.txt'))).toBe(false)
      expect(() => assertInsideDocumentsRoot(root, join(root, '..', 'secret.txt'))).toThrow(USER_ERRORS.unsafeDocumentPath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects destructive operations against the documents root and traversals', () => {
    const root = mkdtempSync(join(tmpdir(), 'matterdock-docs-'))
    try {
      mkdirSync(join(root, 'keep-me'))
      expect(() => removeManagedDirectory(root, '.')).toThrow(USER_ERRORS.unsafeDocumentPath)
      expect(() => removeManagedDirectory(root, '..')).toThrow(USER_ERRORS.unsafeDocumentPath)
      expect(() => removeManagedDirectory(root, '')).toThrow(USER_ERRORS.unsafeDocumentPath)
      expect(() => removeManagedDirectory(root, 'documents')).toThrow(USER_ERRORS.unsafeDocumentPath)
      expect(existsSync(root)).toBe(true)
      expect(existsSync(join(root, 'keep-me'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('copies bytes into a UUID folder and can remove only that folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'matterdock-docs-'))
    const sourceDir = mkdtempSync(join(tmpdir(), 'matterdock-src-'))
    try {
      const source = join(sourceDir, 'subsidy-confirmation.pdf')
      writeFileSync(source, 'PDF-BYTES')
      const copied = copyIntoWorkspace(root, uuid, source)
      expect(copied.meta.size).toBe(9)
      expect(copied.relativePath).toBe(`${uuid}/subsidy-confirmation.pdf`)
      removeManagedDirectory(root, uuid)
      expect(existsSync(join(root, uuid))).toBe(false)
      expect(existsSync(source)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(sourceDir, { recursive: true, force: true })
    }
  })

  it('lists only valid quarantine document ids', () => {
    const root = mkdtempSync(join(tmpdir(), 'matterdock-docs-'))
    try {
      mkdirSync(join(root, quarantineName(uuid)), { recursive: true })
      mkdirSync(join(root, 'random-folder'))
      mkdirSync(join(root, '.something-else'))
      mkdirSync(join(root, '.removing-foo'))
      mkdirSync(join(root, '.removing-'))
      expect(listQuarantineDocumentIds(root)).toEqual([uuid])
      expect(existsSync(join(root, 'random-folder'))).toBe(true)
      expect(existsSync(join(root, '.something-else'))).toBe(true)
      expect(existsSync(join(root, '.removing-foo'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not treat a sibling directory as inside the root', () => {
    const parent = mkdtempSync(join(tmpdir(), 'matterdock-parent-'))
    try {
      const root = join(parent, 'documents')
      mkdirSync(root)
      expect(isInsideRoot(root, join(parent, 'documents-extra', 'x.pdf'))).toBe(false)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })
})
