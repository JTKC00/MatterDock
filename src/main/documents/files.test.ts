import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { USER_ERRORS } from '@shared/errors'
import { assertInsideDocumentsRoot, copyIntoWorkspace, isInsideRoot, removeManagedDirectory } from './files'

describe('document path safety', () => {
  it('rejects paths outside the managed documents root', () => {
    const root = mkdtempSync(join(tmpdir(), 'matterdock-docs-'))
    try {
      expect(isInsideRoot(root, join(root, 'abc', 'file.pdf'))).toBe(true)
      expect(isInsideRoot(root, join(root, '..', 'outside.txt'))).toBe(false)
      expect(() => assertInsideDocumentsRoot(root, join(root, '..', 'secret.txt'))).toThrow(USER_ERRORS.unsafeDocumentPath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('copies bytes into an id folder and can remove only that folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'matterdock-docs-'))
    const sourceDir = mkdtempSync(join(tmpdir(), 'matterdock-src-'))
    try {
      const source = join(sourceDir, 'subsidy-confirmation.pdf')
      writeFileSync(source, 'PDF-BYTES')
      const copied = copyIntoWorkspace(root, 'doc-id', source)
      expect(copied.meta.size).toBe(9)
      expect(copied.relativePath).toBe('doc-id/subsidy-confirmation.pdf')
      removeManagedDirectory(root, 'doc-id')
      expect(() => assertInsideDocumentsRoot(root, source)).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(sourceDir, { recursive: true, force: true })
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
