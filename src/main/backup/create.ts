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
import { AppError, USER_ERRORS } from '@shared/errors'
import { BACKUP_SCHEMA_VERSION } from '@shared/backup'
import type { DatabaseStore } from '../db/store'
import { appliedSchemaVersion } from '../db/migrate'
import { sha256File } from './hash'
import { serializeManifest, type BackupManifestV1 } from './manifest'
import { DATABASE_ENTRY, MANIFEST_ENTRY } from './paths'
import { collectManagedSnapshot, documentCounts } from './snapshot'
import { extractBackupZip, writeZip } from './zip'
import { validateExtractedBackup } from './validate'

export type CreateBackupHooks = {
  afterZipWrite?: (archivePath: string) => void
}

export type CreateBackupInput = {
  store: DatabaseStore
  documentsRoot: string
  destinationPath: string
  appVersion: string
  now?: () => string
  hooks?: CreateBackupHooks
}

export async function createBackupBundle(input: CreateBackupInput): Promise<BackupManifestV1> {
  const destinationPath = input.destinationPath
  const parent = dirname(destinationPath)
  if (!existsSync(parent)) {
    throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_DESTINATION')
  }
  const owned = mkdtempSync(join(parent, '.matterdock-backup-'))
  const staging = join(owned, 'contents')
  const tempArchive = join(owned, 'archive.tmp')
  const verifyDir = join(owned, 'verify')
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
      await writeZip(tempArchive, zipFiles)
      input.hooks?.afterZipWrite?.(tempArchive)
      await extractBackupZip(tempArchive, verifyDir)
      await validateExtractedBackup(verifyDir)
      replaceFileKeepPrevious(tempArchive, destinationPath, join(owned, 'previous'))
      return manifest
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_FAILED', { cause: error })
  } finally {
    rmSync(owned, { recursive: true, force: true })
  }
}

function replaceFileKeepPrevious(source: string, destination: string, previousHold: string): void {
  if (!existsSync(destination)) {
    renameSync(source, destination)
    return
  }
  renameSync(destination, previousHold)
  try {
    renameSync(source, destination)
  } catch (error) {
    try {
      if (!existsSync(destination) && existsSync(previousHold)) renameSync(previousHold, destination)
    } catch (restoreError) {
      console.error('[matterdock] could not restore previous backup', restoreError)
    }
    throw error
  }
}
