import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import { persistDatabase } from '../db/open'
import { DatabaseStore } from '../db/store'
import * as dbDocuments from '../db/documents'
import * as matters from '../db/matters'
import {
  quarantineManagedDirectory,
  quarantineName
} from '../documents/files'
import { createDocumentService } from '../documents/service'
import { createMatterDeletionService } from './service'

const tempDirectories: string[] = []

function tempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

async function setup(options?: { persistFn?: (db: Database, filePath: string) => void }) {
  const userData = tempDir('matterdock-delete-')
  const sourceDirectory = tempDir('matterdock-delete-src-')
  const store = new DatabaseStore(
    join(userData, 'matterdock.sqlite'),
    options?.persistFn ?? persistDatabase
  )
  await store.initialize({ seed: false })
  const matter = store.mutate((db) => {
    const created = matters.createMatter(db, { title: 'Matter to remove', status: 'archived' })
    return matters.moveMatterToTrash(db, created.id)
  })
  const documentsRoot = join(userData, 'documents')
  const documentService = createDocumentService(store, documentsRoot)
  return { store, matter, sourceDirectory, documentsRoot, documentService }
}

function sourceFile(directory: string, name: string, content: string): string {
  const path = join(directory, name)
  writeFileSync(path, content)
  return path
}

describe('Matter permanent deletion service', () => {
  it('deletes Matter metadata and managed copies without touching reference originals', async () => {
    const { store, matter, sourceDirectory, documentsRoot, documentService } = await setup()
    const referencePath = sourceFile(sourceDirectory, 'reference.pdf', 'REFERENCE-ORIGINAL')
    const copySourcePath = sourceFile(sourceDirectory, 'managed.pdf', 'MANAGED-SOURCE')
    const reference = documentService.addReference({ matterId: matter.id, path: referencePath })
    const copy = documentService.addCopy({ matterId: matter.id, path: copySourcePath })
    const activeCopyDirectory = join(documentsRoot, copy.id)

    const deletion = createMatterDeletionService(store, documentsRoot)
    expect(deletion.deletePermanently(matter.id)).toEqual({ id: matter.id })

    expect(() => matters.getMatter(store.query((db) => db), matter.id)).toThrow(USER_ERRORS.matterNotFound)
    expect(store.query((db) => dbDocuments.findDocument(db, reference.id))).toBeNull()
    expect(store.query((db) => dbDocuments.findDocument(db, copy.id))).toBeNull()
    expect(existsSync(activeCopyDirectory)).toBe(false)
    expect(existsSync(join(documentsRoot, quarantineName(copy.id)))).toBe(false)
    expect(readFileSync(referencePath, 'utf8')).toBe('REFERENCE-ORIGINAL')
    expect(readFileSync(copySourcePath, 'utf8')).toBe('MANAGED-SOURCE')
  })

  it('returns the existing Matter-not-found error and does not silently succeed', async () => {
    const { store, documentsRoot } = await setup()
    const deletion = createMatterDeletionService(store, documentsRoot)
    const missingId = '550e8400-e29b-41d4-a716-446655440000'

    expect(() => deletion.deletePermanently(missingId)).toThrow(USER_ERRORS.matterNotFound)
    try {
      deletion.deletePermanently(missingId)
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('MATTER_NOT_FOUND')
    }
  })

  it('restores every quarantined copy when database persistence fails', async () => {
    let failPersist = false
    const { store, matter, sourceDirectory, documentsRoot, documentService } = await setup({
      persistFn: (db, filePath) => {
        if (failPersist) throw new Error('simulated persistence failure')
        persistDatabase(db, filePath)
      }
    })
    const firstSource = sourceFile(sourceDirectory, 'one.pdf', 'ONE')
    const secondSource = sourceFile(sourceDirectory, 'two.pdf', 'TWO')
    const first = documentService.addCopy({ matterId: matter.id, path: firstSource })
    const second = documentService.addCopy({ matterId: matter.id, path: secondSource })
    failPersist = true

    const deletion = createMatterDeletionService(store, documentsRoot)
    expect(() => deletion.deletePermanently(matter.id)).toThrow(USER_ERRORS.persistFailed)

    expect(matters.getMatter(store.query((db) => db), matter.id).id).toBe(matter.id)
    expect(store.query((db) => dbDocuments.findDocument(db, first.id))).not.toBeNull()
    expect(store.query((db) => dbDocuments.findDocument(db, second.id))).not.toBeNull()
    for (const document of [first, second]) {
      expect(existsSync(join(documentsRoot, document.id))).toBe(true)
      expect(existsSync(join(documentsRoot, quarantineName(document.id)))).toBe(false)
    }
    expect(readFileSync(firstSource, 'utf8')).toBe('ONE')
    expect(readFileSync(secondSource, 'utf8')).toBe('TWO')
  })

  it('restores every quarantined copy when the database mutation fails', async () => {
    const { store, matter, sourceDirectory, documentsRoot, documentService } = await setup()
    const firstSource = sourceFile(sourceDirectory, 'one.pdf', 'ONE')
    const secondSource = sourceFile(sourceDirectory, 'two.pdf', 'TWO')
    const first = documentService.addCopy({ matterId: matter.id, path: firstSource })
    const second = documentService.addCopy({ matterId: matter.id, path: secondSource })
    vi.spyOn(store, 'mutate').mockImplementation(() => {
      throw new Error('simulated database mutation failure')
    })

    const deletion = createMatterDeletionService(store, documentsRoot)
    expect(() => deletion.deletePermanently(matter.id)).toThrow(USER_ERRORS.matterDeleteFailed)

    expect(matters.getMatter(store.query((db) => db), matter.id).id).toBe(matter.id)
    expect(store.query((db) => dbDocuments.findDocument(db, first.id))).not.toBeNull()
    expect(store.query((db) => dbDocuments.findDocument(db, second.id))).not.toBeNull()
    for (const document of [first, second]) {
      expect(existsSync(join(documentsRoot, document.id))).toBe(true)
      expect(existsSync(join(documentsRoot, quarantineName(document.id)))).toBe(false)
    }
    expect(readFileSync(firstSource, 'utf8')).toBe('ONE')
    expect(readFileSync(secondSource, 'utf8')).toBe('TWO')
  })

  it('keeps a stale quarantine after cleanup failure without restoring an active copy', async () => {
    const { store, matter, sourceDirectory, documentsRoot, documentService } = await setup()
    const source = sourceFile(sourceDirectory, 'managed.pdf', 'MANAGED')
    const document = documentService.addCopy({ matterId: matter.id, path: source })
    const deletion = createMatterDeletionService(store, documentsRoot, {
      removeQuarantineDirectory: () => {
        throw new Error('simulated quarantine cleanup failure')
      }
    })

    expect(deletion.deletePermanently(matter.id)).toEqual({ id: matter.id })
    expect(() => matters.getMatter(store.query((db) => db), matter.id)).toThrow(USER_ERRORS.matterNotFound)
    expect(store.query((db) => dbDocuments.findDocument(db, document.id))).toBeNull()
    expect(existsSync(join(documentsRoot, document.id))).toBe(false)
    expect(existsSync(join(documentsRoot, quarantineName(document.id)))).toBe(true)
    expect(readFileSync(source, 'utf8')).toBe('MANAGED')
  })

  it('restores the first two copies when the third quarantine fails', async () => {
    const { store, matter, sourceDirectory, documentsRoot, documentService } = await setup()
    const sources = [
      sourceFile(sourceDirectory, 'one.pdf', 'ONE'),
      sourceFile(sourceDirectory, 'two.pdf', 'TWO'),
      sourceFile(sourceDirectory, 'three.pdf', 'THREE')
    ]
    const documents = sources.map((path) => documentService.addCopy({ matterId: matter.id, path }))
    let attempts = 0
    const deletion = createMatterDeletionService(store, documentsRoot, {
      quarantineManagedDirectory: (root, id) => {
        attempts += 1
        if (attempts === 3) throw new Error('simulated third quarantine failure')
        return quarantineManagedDirectory(root, id)
      }
    })

    expect(() => deletion.deletePermanently(matter.id)).toThrow(USER_ERRORS.matterDeleteFailed)
    expect(attempts).toBe(3)
    expect(matters.getMatter(store.query((db) => db), matter.id).id).toBe(matter.id)
    expect(store.query((db) => dbDocuments.listDocumentsForMatter(db, matter.id))).toHaveLength(3)
    for (const [index, document] of documents.entries()) {
      expect(existsSync(join(documentsRoot, document.id))).toBe(true)
      expect(existsSync(join(documentsRoot, quarantineName(document.id)))).toBe(false)
      expect(readFileSync(sources[index], 'utf8')).toBe(['ONE', 'TWO', 'THREE'][index])
    }
  })

  it('rejects corrupt managed paths before moving files or deleting the Matter', async () => {
    const { store, matter, sourceDirectory, documentsRoot, documentService } = await setup()
    const source = sourceFile(sourceDirectory, 'managed.pdf', 'MANAGED')
    const document = documentService.addCopy({ matterId: matter.id, path: source })
    const outsideDirectory = tempDir('matterdock-delete-outside-')
    const outside = sourceFile(outsideDirectory, 'sentinel.txt', 'DO NOT TOUCH')
    const outsideRelative = relative(documentsRoot, outside).replaceAll('\\', '/')
    store.mutate((db) => {
      db.run('UPDATE documents SET managed_path = ? WHERE id = ?', [outsideRelative, document.id])
    })

    const deletion = createMatterDeletionService(store, documentsRoot)
    expect(() => deletion.deletePermanently(matter.id)).toThrow(USER_ERRORS.unsafeDocumentPath)
    expect(matters.getMatter(store.query((db) => db), matter.id).id).toBe(matter.id)
    expect(existsSync(join(documentsRoot, document.id))).toBe(true)
    expect(readFileSync(outside, 'utf8')).toBe('DO NOT TOUCH')
  })

  it('refuses an invalid document identity instead of ever targeting the documents root', async () => {
    const { store, matter, documentsRoot } = await setup()
    mkdirSync(documentsRoot, { recursive: true })
    store.mutate((db) => {
      dbDocuments.insertDocument(db, {
        id: '.',
        matterId: matter.id,
        displayName: 'invalid.pdf',
        storageMode: 'copy',
        originalPath: null,
        managedPath: 'invalid.pdf',
        fileExtension: 'pdf',
        mimeType: 'application/pdf',
        fileSize: 1
      })
    })

    const deletion = createMatterDeletionService(store, documentsRoot)
    expect(() => deletion.deletePermanently(matter.id)).toThrow(USER_ERRORS.unsafeDocumentPath)
    expect(existsSync(documentsRoot)).toBe(true)
    expect(matters.getMatter(store.query((db) => db), matter.id).id).toBe(matter.id)
  })

  it('rejects permanent deletion of a non-trashed Matter before touching files', async () => {
    const userData = tempDir('matterdock-delete-live-')
    const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
    await store.initialize({ seed: false })
    const live = store.mutate((db) => matters.createMatter(db, { title: 'Not in trash' }))
    const archived = store.mutate((db) => matters.archiveMatter(db, live.id))
    const documentsRoot = join(userData, 'documents')
    const deletion = createMatterDeletionService(store, documentsRoot)

    expect(() => deletion.deletePermanently(archived.id)).toThrow(USER_ERRORS.matterDeleteRequiresTrash)
    try {
      deletion.deletePermanently(archived.id)
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('MATTER_DELETE_REQUIRES_TRASH')
    }
    expect(matters.getMatter(store.query((db) => db), archived.id).trashedAt).toBeNull()
  })

  it('respects the workspace exclusive/busy guard before touching files', async () => {
    const { store, matter, documentsRoot } = await setup()
    const deletion = createMatterDeletionService(store, documentsRoot)

    await store.withExclusive('backup', async () => {
      expect(() => deletion.deletePermanently(matter.id)).toThrow(USER_ERRORS.workspaceBusy)
    })
    expect(matters.getMatter(store.query((db) => db), matter.id).id).toBe(matter.id)
  })
})
