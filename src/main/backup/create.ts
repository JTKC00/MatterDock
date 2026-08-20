import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  copyFileSync,
  writeFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
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
  failCandidateRename?: () => void
  failOldRestore?: () => void
  failCleanup?: () => void
}

export type CreateBackupInput = {
  store: DatabaseStore
  documentsRoot: string
  destinationPath: string
  appVersion: string
  now?: () => string
  hooks?: CreateBackupHooks
}

type FinalizationResult =
  | { status: 'committed' }
  | { status: 'failed-restored-old' }
  | { status: 'failed-old-preserved'; recoveryPath: string }
  | { status: 'failed-no-previous' }

export async function createBackupBundle(input: CreateBackupInput): Promise<BackupManifestV1> {
  const destinationPath = input.destinationPath
  const parent = dirname(destinationPath)
  if (!existsSync(parent)) {
    throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_DESTINATION')
  }
  const token = randomUUID()
  const staging = mkdtempSync(join(parent, '.matterdock-backup-'))
  const candidatePath = join(parent, `.matterdock-owned-${token}.new`)
  const previousHoldPath = join(parent, `.matterdock-owned-${token}.previous`)
  let preserveRecoveryPath: string | null = null
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
      await writeZip(candidatePath, zipFiles)
      input.hooks?.afterZipWrite?.(candidatePath)
      const verifyDir = join(staging, 'verify')
      await extractBackupZip(candidatePath, verifyDir)
      await validateExtractedBackup(verifyDir)

      const result = finalizeBackupReplacement({
        candidatePath,
        destinationPath,
        previousHoldPath,
        hooks: input.hooks
      })

      if (result.status === 'committed') {
        try {
          input.hooks?.failCleanup?.()
          removeIfExists(previousHoldPath)
          removeIfExists(candidatePath)
        } catch (error) {
          console.warn('[matterdock] backup housekeeping failed after commit', error)
        }
        return manifest
      }

      if (result.status === 'failed-restored-old') {
        removeIfExists(candidatePath)
        throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_REPLACE_FAILED')
      }

      if (result.status === 'failed-old-preserved') {
        preserveRecoveryPath = result.recoveryPath
        throw new AppError(USER_ERRORS.backupPreviousPreserved, 'BACKUP_PREVIOUS_PRESERVED', {
          recoveryPath: result.recoveryPath
        })
      }

      removeIfExists(candidatePath)
      throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_FAILED')
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_FAILED', { cause: error })
  } finally {
    try {
      rmSync(staging, { recursive: true, force: true })
    } catch (error) {
      console.warn('[matterdock] backup staging cleanup failed', error)
    }
    if (candidatePath !== preserveRecoveryPath) {
      try {
        removeIfExists(candidatePath)
      } catch (error) {
        console.warn('[matterdock] leftover backup candidate cleanup failed', error)
      }
    }
  }
}

export function finalizeBackupReplacement(input: {
  candidatePath: string
  destinationPath: string
  previousHoldPath: string
  hooks?: CreateBackupHooks
}): FinalizationResult {
  const { candidatePath, destinationPath, previousHoldPath, hooks } = input

  if (!existsSync(destinationPath)) {
    try {
      hooks?.failCandidateRename?.()
      renameSync(candidatePath, destinationPath)
      return { status: 'committed' }
    } catch {
      return { status: 'failed-no-previous' }
    }
  }

  renameSync(destinationPath, previousHoldPath)
  try {
    hooks?.failCandidateRename?.()
    renameSync(candidatePath, destinationPath)
    return { status: 'committed' }
  } catch {
    try {
      hooks?.failOldRestore?.()
      if (!existsSync(destinationPath) && existsSync(previousHoldPath)) {
        renameSync(previousHoldPath, destinationPath)
      }
      return { status: 'failed-restored-old' }
    } catch {
      const recoveryPath = preservePreviousBackup(destinationPath, previousHoldPath)
      return { status: 'failed-old-preserved', recoveryPath }
    }
  }
}

function preservePreviousBackup(destinationPath: string, previousHoldPath: string): string {
  const parent = dirname(destinationPath)
  const recoveryDir = join(parent, `.matterdock-backup-recovery-${randomUUID()}`)
  const recoveryFile = join(recoveryDir, basename(destinationPath))
  mkdirSync(recoveryDir, { recursive: true })
  if (existsSync(previousHoldPath)) {
    try {
      renameSync(previousHoldPath, recoveryFile)
      return recoveryFile
    } catch {
      return previousHoldPath
    }
  }
  if (existsSync(destinationPath)) {
    copyFileSync(destinationPath, recoveryFile)
    return recoveryFile
  }
  throw new AppError(USER_ERRORS.backupFailed, 'BACKUP_PREVIOUS_LOST')
}

function removeIfExists(path: string): void {
  rmSync(path, { force: true })
}
