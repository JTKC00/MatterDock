import { existsSync } from 'node:fs'
import { AppError } from '@shared/errors'
import * as documents from '../db/documents'
import type { DatabaseStore } from '../db/store'
import {
  listQuarantineDocumentIds,
  managedDirectoryPath,
  removeQuarantineDirectory,
  restoreQuarantineIfAbsent
} from './files'

export type QuarantineRecord = { storageMode: 'reference' | 'copy' } | null

export type QuarantineDecision = 'restore' | 'delete' | 'leave'

export function decideQuarantineAction(
  record: QuarantineRecord | 'error',
  activeExists: boolean
): QuarantineDecision {
  if (record === 'error') return 'leave'
  if (!record) return 'delete'
  if (record.storageMode !== 'copy') return 'leave'
  if (activeExists) return 'leave'
  return 'restore'
}

export function reconcileDocumentQuarantines(
  root: string,
  lookup: (id: string) => QuarantineRecord | 'error',
  hooks?: {
    restore?: (root: string, id: string) => 'restored' | 'collision' | 'missing'
    remove?: (root: string, id: string) => void
    activeExists?: (root: string, id: string) => boolean
  }
): void {
  const ids = listQuarantineDocumentIds(root)
  const restore = hooks?.restore ?? restoreQuarantineIfAbsent
  const remove = hooks?.remove ?? removeQuarantineDirectory
  const activeExists =
    hooks?.activeExists ?? ((documentsRoot, id) => existsSync(managedDirectoryPath(documentsRoot, id)))

  for (const id of ids) {
    try {
      const record = lookup(id)
      const decision = decideQuarantineAction(record, activeExists(root, id))
      if (decision === 'leave') {
        if (record === 'error') {
          console.error(`[matterdock] document quarantine left untouched after lookup failure: ${id}`)
        } else if (record && record.storageMode !== 'copy') {
          console.error(`[matterdock] document quarantine left untouched for non-copy record: ${id}`)
        } else if (record?.storageMode === 'copy') {
          console.error(`[matterdock] document quarantine left untouched because the active folder already exists: ${id}`)
        }
        continue
      }
      if (decision === 'restore') {
        const result = restore(root, id)
        if (result !== 'restored') {
          console.error(`[matterdock] document quarantine restore did not complete: ${id} (${result})`)
        }
        continue
      }
      remove(root, id)
    } catch (error) {
      console.error('[matterdock] document quarantine recovery failed', error)
    }
  }
}

export function reconcileDocumentQuarantinesFromStore(store: DatabaseStore, root: string): void {
  reconcileDocumentQuarantines(root, (id) => {
    try {
      const found = store.query((db) => documents.findDocument(db, id))
      return found ? { storageMode: found.storageMode } : null
    } catch (error) {
      if (error instanceof AppError && error.code === 'DOCUMENT_NOT_FOUND') return null
      console.error('[matterdock] document quarantine lookup failed', error)
      return 'error'
    }
  })
}
