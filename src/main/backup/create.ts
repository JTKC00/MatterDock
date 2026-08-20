import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { AppError, USER_ERRORS } from '@shared/errors'
import { BACKUP_SCHEMA_VERSION } from '@shared/backup'
import type { DatabaseStore } from '../db/store'
import { appliedSchemaVersion } from '../db/migrate'
import { sha256File } from './hash'
import { serializeManifest, type BackupManifestV1 } from './manifest'
import { DATABASE_ENTRY, MANIFEST_ENTRY } from './paths'
import { collectManagedSnapshot, documentCounts } from './snapshot'
import { extractBackupZip, listZipEntries, writeZip } from './zip'

export type CreateBackupInput = {
  store: DatabaseStore
  documentsRoot: string
  destinationPath: string
  appVersion: string
  now?: () => string
}

export async function createBackupBundle(input: CreateBackupInput): Promise<BackupManifestV1> {
  const destinationPath = input.destinationPath
  const parent = dirname(destinationPath)
  if (!existsSync(parent)) {
    throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_DESTINATION')
  }
  const tempArchive = `${destinationPath}.tmp`
  const staging = mkdtempSync(join(tmpdir(), 'matterdock-backup-'))
  try {
    return await input.store.withExclusive('backup', async () => {
      input.store.persist()
      const managed = input.store.query((db) => collectManagedSnapshot(db, input.documentsRoot))
      const counts = input.store.query(documentCounts)
      const schemaVersion = input.store.query(appliedSchemaVersion)

      mkdirSync(join(staging, 'documents'), { recursive: true })
      const dbSource = input.store.path()
      const stagedDb = join(staging, DATABASE_ENTRY)
      copyFileSync(dbSource, stagedDb)

      const manifestFiles: BackupManifestV1['managedDocuments'] = []
      for (const file of managed) {
        const stagedPath = join(staging, ...file.archivePath.split('/'))
        mkdirSync(dirname(stagedPath), { recursive: true })
        copyFileSync(file.sourcePath, stagedPath)
        if (!existsSync(stagedPath) || statSync(stagedPath).size !== file.size) {
          throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_COPY')
        }
        manifestFiles.push({
          documentId: file.documentId,
          path: file.archivePath,
          sha256: await sha256File(stagedPath),
          size: statSync(stagedPath).size
        })
      }

      const manifest: BackupManifestV1 = {
        backupSchemaVersion: BACKUP_SCHEMA_VERSION,
        app: 'MatterDock',
        appVersion: input.appVersion,
        createdAt: (input.now ?? (() => new Date().toISOString()))(),
        databaseSchemaVersion: schemaVersion,
        database: {
          path: DATABASE_ENTRY,
          sha256: await sha256File(stagedDb),
          size: statSync(stagedDb).size
        },
        counts: {
          ...counts,
          managedDocuments: manifestFiles.length
        },
        managedDocuments: manifestFiles
      }
      writeFileSync(join(staging, MANIFEST_ENTRY), serializeManifest(manifest), 'utf8')

      const zipFiles = [
        { realPath: join(staging, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
        { realPath: stagedDb, archivePath: DATABASE_ENTRY },
        ...manifestFiles.map((file) => ({
          realPath: join(staging, ...file.path.split('/')),
          archivePath: file.path
        }))
      ]
      rmSync(tempArchive, { force: true })
      await writeZip(tempArchive, zipFiles)
      await validateWrittenArchive(tempArchive, manifest)
      renameSync(tempArchive, destinationPath)
      return manifest
    })
  } catch (error) {
    rmSync(tempArchive, { force: true })
    if (error instanceof AppError) throw error
    throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_FAILED', { cause: error })
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

async function validateWrittenArchive(archivePath: string, manifest: BackupManifestV1): Promise<void> {
  const entries = await listZipEntries(archivePath)
  const names = new Set(entries.map((entry) => entry.fileName))
  if (!names.has(MANIFEST_ENTRY) || !names.has(DATABASE_ENTRY)) {
    throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_ARCHIVE_INCOMPLETE')
  }
  for (const file of manifest.managedDocuments) {
    if (!names.has(file.path)) {
      throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_ARCHIVE_INCOMPLETE')
    }
  }
  const unexpected = entries.filter(
    (entry) =>
      entry.fileName !== MANIFEST_ENTRY &&
      entry.fileName !== DATABASE_ENTRY &&
      !entry.isDirectory &&
      !manifest.managedDocuments.some((file) => file.path === entry.fileName)
  )
  if (unexpected.length > 0) {
    throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_ARCHIVE_UNEXPECTED')
  }
}

export async function assertArchiveRoundTrip(archivePath: string, stagingDir: string): Promise<void> {
  await extractBackupZip(archivePath, stagingDir)
}
