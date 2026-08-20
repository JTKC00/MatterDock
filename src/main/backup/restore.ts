import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { AppError, USER_ERRORS } from '@shared/errors'
import type { BackupSummary } from '@shared/backup'
import type { DatabaseStore } from '../db/store'

import { extractBackupZip } from './zip'
import { assertForeignKeys, assertIntegrity, validateExtractedBackup } from './validate'
import { DATABASE_ENTRY } from './paths'
import {
  cleanupRestoreWork,
  clearRestoreState,
  copyFileReplace,
  promoteRecovery,
  replaceDirectory,
  snapshotWorkspace,
  restoreWorkspaceFromRecovery,
  writeRestoreState,
  type RestoreState
} from './recovery'

export type RestoreHooks = {
  afterRecoverySnapshot?: () => void
  afterActivate?: () => void
}

export async function inspectBackupArchive(input: {
  archivePath: string
  stagingDir: string
}): Promise<{ summary: BackupSummary }> {
  mkdirSync(input.stagingDir, { recursive: true })
  try {
    await extractBackupZip(input.archivePath, input.stagingDir)
    return await validateExtractedBackup(input.stagingDir)
  } catch (error) {
    cleanupRestoreWork(input.stagingDir)
    if (error instanceof AppError) throw error
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_INSPECT', { cause: error })
  }
}

export async function restoreFromStaging(input: {
  store: DatabaseStore
  userData: string
  documentsRoot: string
  stagingDir: string
  hooks?: RestoreHooks
}): Promise<void> {
  const dbPath = input.store.path()
  const recoveryPath = join(input.userData, 'recovery', `pre-restore-${stamp()}`)
  const stateBase: Omit<RestoreState, 'phase'> = {
    stagingPath: input.stagingDir,
    recoveryPath,
    startedAt: new Date().toISOString()
  }

  try {
    await input.store.withExclusive('restore', async () => {
      await validateExtractedBackup(input.stagingDir, { persistMigration: true })
      input.store.persist()
      snapshotWorkspace({
        dbPath,
        documentsRoot: input.documentsRoot,
        recoveryPath
      })
      writeRestoreState(input.userData, { ...stateBase, phase: 'prepared' })
      try {
        input.hooks?.afterRecoverySnapshot?.()
      } catch (error) {
        clearRestoreState(input.userData)
        throw error
      }
      writeRestoreState(input.userData, { ...stateBase, phase: 'replacing' })
      await input.store.closeMemory()
      try {
        activateStaging({
          dbPath,
          documentsRoot: input.documentsRoot,
          stagingDir: input.stagingDir
        })
        await input.store.initialize({ seed: false })
        input.hooks?.afterActivate?.()
        input.store.query((db) => {
          assertIntegrity(db)
          assertForeignKeys(db)
        })
        writeRestoreState(input.userData, { ...stateBase, phase: 'committed' })
        promoteRecovery(input.userData, recoveryPath)
        cleanupRestoreWork(input.stagingDir)
        clearRestoreState(input.userData)
      } catch (error) {
        await rollbackActive(input, recoveryPath, error)
      }
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(USER_ERRORS.restoreFailedRecovered, 'RESTORE_FAILED', { cause: error })
  }
}

function activateStaging(input: { dbPath: string; documentsRoot: string; stagingDir: string }): void {
  const stagedDb = join(input.stagingDir, DATABASE_ENTRY)
  const stagedDocs = join(input.stagingDir, 'documents')
  if (!existsSync(stagedDb)) {
    throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_MISSING_REQUIRED')
  }
  copyFileReplace(stagedDb, input.dbPath)
  replaceDirectory(existsSync(stagedDocs) ? stagedDocs : makeEmptyDocs(input.stagingDir), input.documentsRoot)
}

function makeEmptyDocs(stagingDir: string): string {
  const empty = join(stagingDir, 'documents')
  mkdirSync(empty, { recursive: true })
  return empty
}

async function rollbackActive(
  input: {
    store: DatabaseStore
    userData: string
    documentsRoot: string
  },
  recoveryPath: string,
  cause: unknown
): Promise<never> {
  try {
    await input.store.closeMemory()
    restoreWorkspaceFromRecovery({
      dbPath: input.store.path(),
      documentsRoot: input.documentsRoot,
      recoveryPath
    })
    await input.store.initialize({ seed: false })
    clearRestoreState(input.userData)
  } catch (error) {
    console.error('[matterdock] restore rollback failed', error)
    throw new AppError(USER_ERRORS.restoreFailedUnrecovered, 'RESTORE_ROLLBACK_FAILED', { cause: error })
  }
  if (cause instanceof AppError && cause.code === 'RESTORE_INJECTED') {
    throw new AppError(USER_ERRORS.restoreFailedRecovered, 'RESTORE_FAILED', { cause })
  }
  throw new AppError(USER_ERRORS.restoreFailedRecovered, 'RESTORE_FAILED', { cause })
}

function stamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}
