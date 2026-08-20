import { existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import * as documents from '../db/documents'
import { get } from '../db/sql'
import {
  absoluteManagedPath,
  isDocumentId,
  isStrictlyInsideRoot,
  listQuarantineDocumentIds
} from '../documents/files'
import { managedArchivePath } from './paths'

export type ManagedSnapshotFile = {
  documentId: string
  archivePath: string
  sourcePath: string
  size: number
}

export function countRows(db: Database, table: string): number {
  const row = get<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${table}`)
  return row?.count ?? 0
}

export function collectManagedSnapshot(db: Database, documentsRoot: string): ManagedSnapshotFile[] {
  const records = documents.listAllDocuments(db)
  const files: ManagedSnapshotFile[] = []
  const unresolved = unresolvedQuarantines(db, documentsRoot)
  if (unresolved.length > 0) {
    throw new AppError(USER_ERRORS.backupManagedMissing, 'BACKUP_QUARANTINE')
  }

  for (const record of records) {
    if (record.storageMode !== 'copy') continue
    if (!record.managedPath || !isDocumentId(record.id)) {
      throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_MANAGED_PATH')
    }
    let sourcePath: string
    try {
      sourcePath = absoluteManagedPath(documentsRoot, record.managedPath) ?? ''
    } catch (error) {
      if (error instanceof AppError && error.code === 'UNSAFE_PATH') {
        throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_MANAGED_PATH')
      }
      throw error
    }
    if (!sourcePath || !isStrictlyInsideRoot(documentsRoot, sourcePath)) {
      throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_MANAGED_PATH')
    }
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      throw new AppError(USER_ERRORS.backupManagedMissing, 'BACKUP_MANAGED_MISSING')
    }
    files.push({
      documentId: record.id,
      archivePath: managedArchivePath(record.id, basename(record.managedPath)),
      sourcePath,
      size: statSync(sourcePath).size
    })
  }
  return files
}

function unresolvedQuarantines(db: Database, documentsRoot: string): string[] {
  const ids = listQuarantineDocumentIds(documentsRoot)
  const unresolved: string[] = []
  for (const id of ids) {
    const record = documents.findDocument(db, id)
    if (!record || record.storageMode !== 'copy') continue
    const active = absoluteManagedPath(documentsRoot, record.managedPath)
    if (!active || !existsSync(active) || !statSync(active).isFile()) {
      unresolved.push(id)
    }
  }
  return unresolved
}

export function documentCounts(db: Database): { matters: number; documents: number; managedDocuments: number } {
  const matters = countRows(db, 'matters')
  const docs = countRows(db, 'documents')
  const managed = get<{ count: number }>(
    db,
    `SELECT COUNT(*) AS count FROM documents WHERE storage_mode = 'copy'`
  )
  return {
    matters,
    documents: docs,
    managedDocuments: managed?.count ?? 0
  }
}


