import { join } from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import { AppError, USER_ERRORS } from '@shared/errors'
import type { AttachDocumentInput, MatterDocument, PickedFile, RelinkDocumentInput, UpdateDocumentInput } from '@shared/types'
import * as documents from '../db/documents'
import { createId } from '../db/ids'
import type { DatabaseStore } from '../db/store'
import {
  absoluteManagedPath,
  copyIntoWorkspace,
  fileExists,
  quarantineManagedDirectory,
  readFileMeta,
  removeManagedDirectory,
  removeQuarantineDirectory,
  restoreQuarantine
} from './files'

export type DocumentServiceHooks = {
  cleanupQuarantine?: (root: string, documentId: string) => void
}

export function createDocumentService(
  store: DatabaseStore,
  documentsRoot: string,
  hooks: DocumentServiceHooks = {}
) {
  function decorate(doc: MatterDocument): MatterDocument {
    if (doc.storageMode === 'copy') {
      const resolved = absoluteManagedPath(documentsRoot, doc.managedPath)
      const available = fileExists(resolved)
      return {
        ...doc,
        resolvedPath: resolved,
        available,
        availability: available ? 'ok' : 'missing_copy'
      }
    }
    const resolved = doc.originalPath
    const available = fileExists(resolved)
    return {
      ...doc,
      resolvedPath: resolved,
      available,
      availability: available ? 'ok' : 'missing_reference'
    }
  }

  function trustedPath(doc: MatterDocument): string {
    const decorated = decorate(doc)
    if (doc.storageMode === 'copy' && decorated.availability === 'missing_copy') {
      throw new AppError(USER_ERRORS.managedCopyMissing, 'MANAGED_COPY_MISSING')
    }
    if (!decorated.resolvedPath || !decorated.available) {
      throw new AppError(USER_ERRORS.fileUnavailable, 'FILE_UNAVAILABLE')
    }
    return decorated.resolvedPath
  }

  return {
    async pick(window: BrowserWindow | null): Promise<PickedFile | null> {
      const options = { title: 'Select a file', properties: ['openFile'] as Array<'openFile'> }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return null
      const meta = readFileMeta(result.filePaths[0])
      return {
        path: meta.path,
        name: meta.name,
        size: meta.size,
        extension: meta.extension ?? ''
      }
    },

    listForMatter(matterId: string): MatterDocument[] {
      return store.query((db) => documents.listDocumentsForMatter(db, matterId)).map(decorate)
    },

    addReference(input: AttachDocumentInput): MatterDocument {
      store.assertWritable()
      const parsed = documents.parseAttachInput(input)
      const meta = readFileMeta(parsed.path)
      return store.mutate((db) => {
        if (documents.findDuplicate(db, parsed.matterId, 'reference', meta.path)) {
          throw new AppError(USER_ERRORS.documentDuplicate, 'DOCUMENT_DUPLICATE')
        }
        return decorate(
          documents.insertDocument(db, {
            matterId: parsed.matterId,
            displayName: meta.name,
            storageMode: 'reference',
            originalPath: meta.path,
            managedPath: null,
            fileExtension: meta.extension,
            mimeType: meta.mimeType,
            fileSize: meta.size,
            notes: parsed.notes
          })
        )
      })
    },

    addCopy(input: AttachDocumentInput): MatterDocument {
      store.assertWritable()
      const parsed = documents.parseAttachInput(input)
      const meta = readFileMeta(parsed.path)
      store.query((db) => {
        if (documents.findDuplicate(db, parsed.matterId, 'copy', meta.path)) {
          throw new AppError(USER_ERRORS.documentDuplicate, 'DOCUMENT_DUPLICATE')
        }
      })
      const id = createId()
      const copied = copyIntoWorkspace(documentsRoot, id, meta.path)
      try {
        return store.mutate((db) => {
          if (documents.findDuplicate(db, parsed.matterId, 'copy', meta.path)) {
            throw new AppError(USER_ERRORS.documentDuplicate, 'DOCUMENT_DUPLICATE')
          }
          return decorate(
            documents.insertDocument(db, {
              id,
              matterId: parsed.matterId,
              displayName: meta.name,
              storageMode: 'copy',
              originalPath: meta.path,
              managedPath: copied.relativePath,
              fileExtension: meta.extension,
              mimeType: meta.mimeType,
              fileSize: copied.meta.size,
              notes: parsed.notes
            })
          )
        })
      } catch (error) {
        removeManagedDirectory(documentsRoot, id)
        throw error
      }
    },

    async open(id: string): Promise<{ id: string }> {
      const doc = store.query((db) => documents.getDocument(db, id))
      const path = trustedPath(doc)
      const failure = await shell.openPath(path)
      if (failure) throw new AppError(USER_ERRORS.fileOpenFailed, 'FILE_OPEN_FAILED')
      return { id }
    },

    reveal(id: string): { id: string } {
      const doc = store.query((db) => documents.getDocument(db, id))
      const path = trustedPath(doc)
      shell.showItemInFolder(path)
      return { id }
    },

    relink(id: string, input: RelinkDocumentInput): MatterDocument {
      store.assertWritable()
      const existing = store.query((db) => documents.getDocument(db, id))
      if (existing.storageMode !== 'reference') {
        throw new AppError(USER_ERRORS.cannotRelinkCopy, 'CANNOT_RELINK_COPY')
      }
      const meta = readFileMeta(input.path)
      return store.mutate((db) => {
        if (documents.findDuplicate(db, existing.matterId, 'reference', meta.path, existing.id)) {
          throw new AppError(USER_ERRORS.documentDuplicate, 'DOCUMENT_DUPLICATE')
        }
        return decorate(
          documents.relinkDocument(db, id, {
            originalPath: meta.path,
            displayName: meta.name,
            fileExtension: meta.extension,
            mimeType: meta.mimeType,
            fileSize: meta.size
          })
        )
      })
    },

    update(id: string, input: UpdateDocumentInput): MatterDocument {
      store.assertWritable()
      return store.mutate((db) => decorate(documents.updateDocument(db, id, input)))
    },

    remove(id: string): { id: string } {
      store.assertWritable()
      const existing = store.query((db) => documents.getDocument(db, id))
      if (existing.storageMode !== 'copy') {
        store.mutate((db) => documents.deleteDocumentRecord(db, id))
        return { id }
      }
      const trash = quarantineManagedDirectory(documentsRoot, existing.id)
      try {
        store.mutate((db) => documents.deleteDocumentRecord(db, id))
      } catch (error) {
        if (trash) restoreQuarantine(documentsRoot, trash, join(documentsRoot, existing.id))
        throw error instanceof AppError ? error : new AppError(USER_ERRORS.documentRemoveFailed, 'DOCUMENT_REMOVE_FAILED')
      }
      if (trash) {
        try {
          const cleanup = hooks.cleanupQuarantine ?? removeQuarantineDirectory
          cleanup(documentsRoot, existing.id)
        } catch (error) {
          console.error('[matterdock] stale managed-copy quarantine retained', error)
        }
      }
      return { id }
    }
  }
}

export type DocumentService = ReturnType<typeof createDocumentService>
