import { AppError, USER_ERRORS } from '@shared/errors'
import { BACKUP_SCHEMA_VERSION } from '@shared/backup'
import { isSha256Hex } from './hash'
import { classifyBackupEntry, DATABASE_ENTRY, MANIFEST_ENTRY } from './paths'

export type ManagedDocumentManifestEntry = {
  documentId: string
  path: string
  sha256: string
  size: number
}

export type BackupManifestV1 = {
  backupSchemaVersion: 1
  app: 'MatterDock'
  appVersion: string
  createdAt: string
  databaseSchemaVersion: number
  database: {
    path: typeof DATABASE_ENTRY
    sha256: string
    size: number
  }
  counts: {
    matters: number
    documents: number
    managedDocuments: number
  }
  managedDocuments: ManagedDocumentManifestEntry[]
}

export type BackupManifest = BackupManifestV1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(USER_ERRORS.backupInvalid, code)
  }
  return value
}

function requiredNumber(value: unknown, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AppError(USER_ERRORS.backupInvalid, code)
  }
  return value
}

export function parseBackupManifest(raw: string): BackupManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MANIFEST_JSON')
  }
  if (!isRecord(parsed)) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MANIFEST')
  }
  const schemaVersion = parsed.backupSchemaVersion
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_SCHEMA')
  }
  switch (schemaVersion) {
    case BACKUP_SCHEMA_VERSION:
      return parseManifestV1(parsed)
    default:
      if (schemaVersion > BACKUP_SCHEMA_VERSION) {
        throw new AppError(USER_ERRORS.backupNewerVersion, 'BACKUP_SCHEMA_NEWER')
      }
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_SCHEMA_UNSUPPORTED')
  }
}

function parseManifestV1(parsed: Record<string, unknown>): BackupManifestV1 {
  if (parsed.app !== 'MatterDock') {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_APP')
  }
  const database = parsed.database
  if (!isRecord(database) || database.path !== DATABASE_ENTRY) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_DATABASE_PATH')
  }
  const sha256 = requiredString(database.sha256, 'BACKUP_DATABASE_HASH').toLowerCase()
  if (!isSha256Hex(sha256)) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_DATABASE_HASH')
  }
  const counts = parsed.counts
  if (!isRecord(counts)) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_COUNTS')
  }
  const managedDocuments = parsed.managedDocuments
  if (!Array.isArray(managedDocuments)) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MANAGED_LIST')
  }
  const seenIds = new Set<string>()
  const seenPaths = new Set<string>()
  const entries: ManagedDocumentManifestEntry[] = managedDocuments.map((item) => {
    if (!isRecord(item)) {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MANAGED_ENTRY')
    }
    const documentId = requiredString(item.documentId, 'BACKUP_MANAGED_ID')
    const path = requiredString(item.path, 'BACKUP_MANAGED_PATH')
    if (classifyBackupEntry(path) !== 'document-file') {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MANAGED_PATH')
    }
    if (!path.startsWith(`documents/${documentId}/`)) {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MANAGED_PATH')
    }
    const hash = requiredString(item.sha256, 'BACKUP_MANAGED_HASH').toLowerCase()
    if (!isSha256Hex(hash)) {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MANAGED_HASH')
    }
    if (seenIds.has(documentId) || seenPaths.has(path)) {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MANAGED_DUPLICATE')
    }
    seenIds.add(documentId)
    seenPaths.add(path)
    return {
      documentId,
      path,
      sha256: hash,
      size: requiredNumber(item.size, 'BACKUP_MANAGED_SIZE')
    }
  })
  const manifest: BackupManifestV1 = {
    backupSchemaVersion: 1,
    app: 'MatterDock',
    appVersion: requiredString(parsed.appVersion, 'BACKUP_APP_VERSION'),
    createdAt: requiredString(parsed.createdAt, 'BACKUP_CREATED_AT'),
    databaseSchemaVersion: requiredNumber(parsed.databaseSchemaVersion, 'BACKUP_DB_SCHEMA'),
    database: {
      path: DATABASE_ENTRY,
      sha256,
      size: requiredNumber(database.size, 'BACKUP_DATABASE_SIZE')
    },
    counts: {
      matters: requiredNumber(counts.matters, 'BACKUP_COUNT_MATTERS'),
      documents: requiredNumber(counts.documents, 'BACKUP_COUNT_DOCUMENTS'),
      managedDocuments: requiredNumber(counts.managedDocuments, 'BACKUP_COUNT_MANAGED')
    },
    managedDocuments: entries
  }
  if (manifest.counts.managedDocuments !== manifest.managedDocuments.length) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_COUNT_MANAGED')
  }
  return manifest
}

export function serializeManifest(manifest: BackupManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export { MANIFEST_ENTRY, DATABASE_ENTRY }
