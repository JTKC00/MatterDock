import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import { attachDocumentSchema, formatZodError, updateDocumentSchema } from '@shared/schemas'
import type {
  AttachDocumentInput,
  DocumentStorageMode,
  MatterDocument,
  UpdateDocumentInput
} from '@shared/types'
import { ZodError } from 'zod/v3'
import { createId, nowIso } from './ids'
import { all, get } from './sql'

type DocumentRow = {
  id: string
  matter_id: string
  display_name: string
  storage_mode: DocumentStorageMode
  original_path: string | null
  managed_path: string | null
  file_extension: string | null
  mime_type: string | null
  file_size: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export function listDocumentsForMatter(db: Database, matterId: string): MatterDocument[] {
  return all<DocumentRow>(
    db,
    `SELECT * FROM documents WHERE matter_id = ? ORDER BY created_at DESC, display_name COLLATE NOCASE`,
    [matterId]
  ).map(mapDocument)
}

export function getDocument(db: Database, id: string): MatterDocument {
  const found = findDocument(db, id)
  if (!found) throw new AppError(USER_ERRORS.documentNotFound, 'DOCUMENT_NOT_FOUND')
  return found
}

export function findDocument(db: Database, id: string): MatterDocument | null {
  const row = get<DocumentRow>(db, 'SELECT * FROM documents WHERE id = ?', [id])
  return row ? mapDocument(row) : null
}

export function findDuplicate(
  db: Database,
  matterId: string,
  storageMode: DocumentStorageMode,
  originalPath: string,
  excludeId?: string
): MatterDocument | null {
  const row = get<DocumentRow>(
    db,
    excludeId
      ? `SELECT * FROM documents
         WHERE matter_id = ? AND storage_mode = ? AND lower(original_path) = lower(?) AND id != ?`
      : `SELECT * FROM documents
         WHERE matter_id = ? AND storage_mode = ? AND lower(original_path) = lower(?)`,
    excludeId ? [matterId, storageMode, originalPath, excludeId] : [matterId, storageMode, originalPath]
  )
  return row ? mapDocument(row) : null
}

export function insertDocument(
  db: Database,
  input: {
    id?: string
    matterId: string
    displayName: string
    storageMode: DocumentStorageMode
    originalPath: string | null
    managedPath: string | null
    fileExtension: string | null
    mimeType: string | null
    fileSize: number | null
    notes?: string | null
  }
): MatterDocument {
  assertMatter(db, input.matterId)
  const now = nowIso()
  const id = input.id ?? createId()
  db.run(
    `INSERT INTO documents (
       id, matter_id, display_name, storage_mode, original_path, managed_path,
       file_extension, mime_type, file_size, notes, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.matterId,
      input.displayName,
      input.storageMode,
      input.originalPath,
      input.managedPath,
      input.fileExtension,
      input.mimeType,
      input.fileSize,
      input.notes ?? null,
      now,
      now
    ]
  )
  touchMatter(db, input.matterId, now)
  return getDocument(db, id)
}

export function updateDocument(db: Database, id: string, input: UpdateDocumentInput): MatterDocument {
  const existing = getDocument(db, id)
  try {
    const parsed = updateDocumentSchema.parse(input)
    const now = nowIso()
    db.run(`UPDATE documents SET notes = ?, updated_at = ? WHERE id = ?`, [
      parsed.notes === undefined ? existing.notes : parsed.notes,
      now,
      id
    ])
    touchMatter(db, existing.matterId, now)
    return getDocument(db, id)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function relinkDocument(
  db: Database,
  id: string,
  meta: {
    originalPath: string
    displayName: string
    fileExtension: string | null
    mimeType: string | null
    fileSize: number | null
  }
): MatterDocument {
  const existing = getDocument(db, id)
  if (existing.storageMode !== 'reference') {
    throw new AppError(USER_ERRORS.cannotRelinkCopy, 'CANNOT_RELINK_COPY')
  }
  const now = nowIso()
  db.run(
    `UPDATE documents
     SET original_path = ?, display_name = ?, file_extension = ?, mime_type = ?, file_size = ?, updated_at = ?
     WHERE id = ?`,
    [meta.originalPath, meta.displayName, meta.fileExtension, meta.mimeType, meta.fileSize, now, id]
  )
  touchMatter(db, existing.matterId, now)
  return getDocument(db, id)
}

export function deleteDocumentRecord(db: Database, id: string): MatterDocument {
  const existing = getDocument(db, id)
  db.run('DELETE FROM documents WHERE id = ?', [id])
  touchMatter(db, existing.matterId, nowIso())
  return existing
}

export function parseAttachInput(input: AttachDocumentInput): AttachDocumentInput {
  try {
    return attachDocumentSchema.parse(input)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

function mapDocument(row: DocumentRow): MatterDocument {
  return {
    id: row.id,
    matterId: row.matter_id,
    displayName: row.display_name,
    storageMode: row.storage_mode,
    originalPath: row.original_path,
    managedPath: row.managed_path,
    fileExtension: row.file_extension,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    available: true,
    availability: 'ok',
    resolvedPath: row.storage_mode === 'copy' ? row.managed_path : row.original_path
  }
}

function assertMatter(db: Database, matterId: string): void {
  const found = get(db, 'SELECT id FROM matters WHERE id = ?', [matterId])
  if (!found) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
}

function touchMatter(db: Database, matterId: string, at: string): void {
  db.run('UPDATE matters SET updated_at = ? WHERE id = ?', [at, matterId])
}
