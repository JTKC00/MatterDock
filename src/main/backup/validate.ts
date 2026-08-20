import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import type { BackupSummary } from '@shared/backup'
import * as documents from '../db/documents'
import { databaseSchemaNewerThanApp, migrate, appliedSchemaVersion } from '../db/migrate'
import { loadSqlJs, persistDatabase } from '../db/open'
import { all } from '../db/sql'
import { parseBackupManifest, type BackupManifest } from './manifest'
import { DATABASE_ENTRY, MANIFEST_ENTRY } from './paths'
import { sha256File } from './hash'
import { documentCounts } from './snapshot'

export async function openRawDatabase(filePath: string): Promise<Database> {
  const SQL = await loadSqlJs()
  const fileBuffer = readFileSync(filePath)
  const db = new SQL.Database(fileBuffer)
  db.run('PRAGMA foreign_keys = ON')
  return db
}

export function assertIntegrity(db: Database): void {
  const rows = all<{ integrity_check: string }>(db, 'PRAGMA integrity_check')
  if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') {
    throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_INTEGRITY')
  }
}

export function assertForeignKeys(db: Database): void {
  const rows = all(db, 'PRAGMA foreign_key_check')
  if (rows.length > 0) {
    throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_FOREIGN_KEYS')
  }
}

export async function validateExtractedBackup(
  stagingDir: string,
  options?: { persistMigration?: boolean }
): Promise<{
  manifest: BackupManifest
  summary: BackupSummary
}> {
  const manifestPath = join(stagingDir, MANIFEST_ENTRY)
  const databasePath = join(stagingDir, DATABASE_ENTRY)
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_MISSING_REQUIRED')
  }
  const manifest = parseBackupManifest(readFileSync(manifestPath, 'utf8'))
  const dbStat = statSync(databasePath)
  if (dbStat.size !== manifest.database.size) {
    throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_DB_SIZE')
  }
  const dbHash = await sha256File(databasePath)
  if (dbHash !== manifest.database.sha256) {
    throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_DB_HASH')
  }

  for (const file of manifest.managedDocuments) {
    const path = join(stagingDir, ...file.path.split('/'))
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MANAGED_MISSING')
    }
    if (statSync(path).size !== file.size) {
      throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MANAGED_SIZE')
    }
    const hash = await sha256File(path)
    if (hash !== file.sha256) {
      throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MANAGED_HASH')
    }
  }

  const db = await openRawDatabase(databasePath)
  try {
    assertIntegrity(db)
    assertForeignKeys(db)
    if (databaseSchemaNewerThanApp(db)) {
      throw new AppError(USER_ERRORS.backupNewerVersion, 'BACKUP_DB_NEWER')
    }
    try {
      migrate(db)
    } catch (error) {
      throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MIGRATE', { cause: error })
    }
    assertIntegrity(db)
    assertForeignKeys(db)
    if (options?.persistMigration) {
      persistDatabase(db, databasePath)
    }

    const copies = documents.listAllDocuments(db).filter((doc) => doc.storageMode === 'copy')
    if (copies.length !== manifest.managedDocuments.length) {
      throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MANAGED_COUNT')
    }
    for (const copy of copies) {
      const entry = manifest.managedDocuments.find((item) => item.documentId === copy.id)
      if (!entry) {
        throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MANAGED_DB')
      }
      if (!copy.managedPath) {
        throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MANAGED_DB')
      }
      const expected = `documents/${copy.id}/${copy.managedPath.split(/[/\\]/).pop()}`
      if (entry.path !== expected) {
        throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MANAGED_DB')
      }
    }
    const extraManifest = manifest.managedDocuments.filter(
      (item) => !copies.some((copy) => copy.id === item.documentId)
    )
    if (extraManifest.length > 0) {
      throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MANAGED_DB')
    }
    const counts = documentCounts(db)
    return {
      manifest,
      summary: {
        createdAt: manifest.createdAt,
        appVersion: manifest.appVersion,
        backupSchemaVersion: manifest.backupSchemaVersion,
        databaseSchemaVersion: appliedSchemaVersion(db),
        matterCount: counts.matters,
        documentCount: counts.documents,
        managedDocumentCount: counts.managedDocuments
      }
    }
  } finally {
    db.close()
  }
}
