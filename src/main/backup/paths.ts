import { isAbsolute, resolve } from 'node:path'
import { AppError, USER_ERRORS } from '@shared/errors'
import { isDocumentId, isInsideRoot } from '../documents/files'

export const MANIFEST_ENTRY = 'manifest.json'
export const DATABASE_ENTRY = 'database.sqlite'
export const DOCUMENTS_PREFIX = 'documents/'

const DOCUMENT_FILE =
  /^documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([^/]+)$/i
const DOCUMENT_DIR =
  /^documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i

export type BackupEntryRole = 'manifest' | 'database' | 'document-file' | 'directory'

export function isUnsafeArchivePath(fileName: string): boolean {
  if (!fileName || fileName.includes('\0')) return true
  if (fileName.includes('\\')) return true
  if (fileName.startsWith('/') || fileName.startsWith('//')) return true
  if (/^[a-zA-Z]:/.test(fileName)) return true
  if (fileName.split('/').includes('..')) return true
  if (isAbsolute(fileName)) return true
  return false
}

export function classifyBackupEntry(fileName: string): BackupEntryRole {
  if (isUnsafeArchivePath(fileName)) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_UNSAFE_PATH')
  }
  const trimmed = fileName.replace(/\/+$/, '')
  if (fileName === MANIFEST_ENTRY) return 'manifest'
  if (fileName === DATABASE_ENTRY) return 'database'
  if (fileName === 'documents' || fileName === DOCUMENTS_PREFIX) return 'directory'
  if (DOCUMENT_DIR.test(fileName) || DOCUMENT_DIR.test(trimmed)) {
    const match = fileName.match(DOCUMENT_DIR) ?? trimmed.match(DOCUMENT_DIR)
    const id = match?.[1]
    if (!id || !isDocumentId(id)) {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_UNEXPECTED_ENTRY')
    }
    return 'directory'
  }
  const fileMatch = fileName.match(DOCUMENT_FILE)
  if (fileMatch) {
    const documentId = fileMatch[1]
    const filename = fileMatch[2]
    if (!documentId || !isDocumentId(documentId)) {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_UNEXPECTED_ENTRY')
    }
    if (!filename || filename === '.' || filename === '..' || filename.startsWith('.removing-')) {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_UNEXPECTED_ENTRY')
    }
    return 'document-file'
  }
  throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_UNEXPECTED_ENTRY')
}

export function archiveEntryDestination(stagingRoot: string, fileName: string): string {
  classifyBackupEntry(fileName)
  const parts = fileName.split('/').filter((part) => part.length > 0)
  const destination = resolve(stagingRoot, ...parts)
  if (!isInsideRoot(stagingRoot, destination)) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_UNSAFE_PATH')
  }
  return destination
}

export function managedArchivePath(documentId: string, fileName: string): string {
  if (!isDocumentId(documentId)) {
    throw new AppError(USER_ERRORS.unsafeDocumentPath, 'UNSAFE_PATH')
  }
  const base = fileName.split(/[/\\]/).pop() ?? fileName
  return `${DOCUMENTS_PREFIX}${documentId}/${base}`
}

export function identityKey(fileName: string): string {
  return fileName.replace(/\/+$/, '')
}
