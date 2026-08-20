export const BACKUP_SCHEMA_VERSION = 1
export const DATA_EXPORT_SCHEMA_VERSION = 1
export const BACKUP_FILE_EXTENSION = 'matterdock-backup'

export type BackupSummary = {
  createdAt: string
  appVersion: string
  backupSchemaVersion: number
  databaseSchemaVersion: number
  matterCount: number
  documentCount: number
  managedDocumentCount: number
}

export type BackupCreateResult = { created: false } | { created: true; path: string }

export type BackupInspectResult =
  | { canceled: true }
  | { canceled: false; token: string; summary: BackupSummary }

export type BackupRestoreResult = { restored: true }

export type DataExportResult = { created: false } | { created: true; path: string }
