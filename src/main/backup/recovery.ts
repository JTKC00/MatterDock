import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { AppError, USER_ERRORS } from '@shared/errors'
import { isStrictlyInsideRoot } from '../documents/files'

export const RESTORE_STATE_NAME = 'restore-state.json'
export const RECOVERY_DIR = 'recovery'
export const LAST_PRE_RESTORE = 'last-pre-restore'

export const RESTORE_PHASES = ['prepared', 'replacing', 'committed'] as const
export type RestorePhase = (typeof RESTORE_PHASES)[number]

export type RestoreState = {
  phase: RestorePhase
  stagingPath: string
  recoveryPath: string
  startedAt: string
}

export function restoreStatePath(userData: string): string {
  return join(userData, RESTORE_STATE_NAME)
}

export function recoveryRoot(userData: string): string {
  return join(userData, RECOVERY_DIR)
}

export function lastPreRestorePath(userData: string): string {
  return join(recoveryRoot(userData), LAST_PRE_RESTORE)
}

export function restoreWorkRoot(userData: string): string {
  return join(userData, 'restore')
}

export function readRestoreState(userData: string): RestoreState | null {
  const path = restoreStatePath(userData)
  if (!existsSync(path)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.error('[matterdock] restore-state could not be parsed', error)
    throw new AppError(USER_ERRORS.restoreInterruptedFatal, 'RESTORE_STATE_INVALID', { cause: error })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AppError(USER_ERRORS.restoreInterruptedFatal, 'RESTORE_STATE_INVALID')
  }
  const record = parsed as Partial<RestoreState>
  if (!RESTORE_PHASES.includes(record.phase as RestorePhase)) {
    throw new AppError(USER_ERRORS.restoreInterruptedFatal, 'RESTORE_STATE_INVALID')
  }
  if (typeof record.stagingPath !== 'string' || typeof record.recoveryPath !== 'string') {
    throw new AppError(USER_ERRORS.restoreInterruptedFatal, 'RESTORE_STATE_INVALID')
  }
  if (typeof record.startedAt !== 'string') {
    throw new AppError(USER_ERRORS.restoreInterruptedFatal, 'RESTORE_STATE_INVALID')
  }
  const state = record as RestoreState
  assertRestoreStatePaths(userData, state)
  return state
}

export function assertRestoreStatePaths(userData: string, state: RestoreState): void {
  const stagingRoot = restoreWorkRoot(userData)
  const recoveryBase = recoveryRoot(userData)
  if (!isStrictlyInsideRoot(stagingRoot, state.stagingPath)) {
    throw new AppError(USER_ERRORS.restoreInterruptedFatal, 'RESTORE_STATE_STAGING_PATH')
  }
  if (!isStrictlyInsideRoot(recoveryBase, state.recoveryPath)) {
    throw new AppError(USER_ERRORS.restoreInterruptedFatal, 'RESTORE_STATE_RECOVERY_PATH')
  }
}

export function writeRestoreState(userData: string, state: RestoreState): void {
  const path = restoreStatePath(userData)
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

export function clearRestoreState(userData: string): void {
  rmSync(restoreStatePath(userData), { force: true })
  rmSync(`${restoreStatePath(userData)}.tmp`, { force: true })
}

export function copyFileReplace(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true })
  const temp = `${destination}.tmp`
  copyFileSync(source, temp)
  renameSync(temp, destination)
}

export function replaceDirectory(source: string, destination: string): void {
  const temp = `${destination}.next`
  rmSync(temp, { recursive: true, force: true })
  mkdirSync(dirname(destination), { recursive: true })
  if (existsSync(source)) {
    copyDir(source, temp)
  } else {
    mkdirSync(temp, { recursive: true })
  }
  rmSync(destination, { recursive: true, force: true })
  renameSync(temp, destination)
}

function copyDir(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  cpSync(source, destination, { recursive: true, force: true })
}

export function snapshotWorkspace(input: {
  dbPath: string
  documentsRoot: string
  recoveryPath: string
}): void {
  rmSync(input.recoveryPath, { recursive: true, force: true })
  mkdirSync(input.recoveryPath, { recursive: true })
  if (existsSync(input.dbPath)) {
    copyFileSync(input.dbPath, join(input.recoveryPath, 'matterdock.sqlite'))
  }
  if (existsSync(input.documentsRoot)) {
    copyDir(input.documentsRoot, join(input.recoveryPath, 'documents'))
  } else {
    mkdirSync(join(input.recoveryPath, 'documents'), { recursive: true })
  }
}

export function restoreWorkspaceFromRecovery(input: {
  dbPath: string
  documentsRoot: string
  recoveryPath: string
}): void {
  const recoveredDb = join(input.recoveryPath, 'matterdock.sqlite')
  const recoveredDocs = join(input.recoveryPath, 'documents')
  if (!existsSync(recoveredDb)) {
    throw new AppError(USER_ERRORS.restoreFailedUnrecovered, 'RESTORE_RECOVERY_MISSING')
  }
  copyFileReplace(recoveredDb, input.dbPath)
  replaceDirectory(recoveredDocs, input.documentsRoot)
}

export function promoteRecovery(userData: string, recoveryPath: string): void {
  const last = lastPreRestorePath(userData)
  if (resolveSame(last, recoveryPath)) return
  const sourceExists = existsSync(recoveryPath)
  const lastExists = existsSync(last)
  if (!sourceExists && lastExists) return
  if (!sourceExists && !lastExists) {
    console.warn('[matterdock] committed restore has no recovery snapshot to promote')
    return
  }
  mkdirSync(recoveryRoot(userData), { recursive: true })
  if (!lastExists) {
    renameSync(recoveryPath, last)
    return
  }
  const retiring = join(recoveryRoot(userData), `.retiring-last-${randomUUID()}`)
  renameSync(last, retiring)
  try {
    renameSync(recoveryPath, last)
  } catch (error) {
    try {
      if (!existsSync(last) && existsSync(retiring)) renameSync(retiring, last)
    } catch (restoreError) {
      console.error('[matterdock] could not put last-pre-restore back', restoreError)
    }
    throw error
  }
  rmSync(retiring, { recursive: true, force: true })
}

function resolveSame(left: string, right: string): boolean {
  const a = join(left)
  const b = join(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

export function cleanupRestoreWork(stagingPath: string): void {
  rmSync(stagingPath, { recursive: true, force: true })
}

export function cleanupOwnedStaging(userData: string, stagingPath: string): void {
  if (!isStrictlyInsideRoot(restoreWorkRoot(userData), stagingPath)) {
    console.warn('[matterdock] refused to delete restore staging outside restore root')
    return
  }
  rmSync(stagingPath, { recursive: true, force: true })
}

export async function reconcileInterruptedRestore(input: {
  userData: string
  dbPath: string
  documentsRoot: string
}): Promise<void> {
  const state = readRestoreState(input.userData)
  if (!state) {
    const leftoverStaging = restoreWorkRoot(input.userData)
    if (existsSync(leftoverStaging)) {
      rmSync(leftoverStaging, { recursive: true, force: true })
    }
    return
  }

  if (state.phase === 'prepared') {
    cleanupOwnedStaging(input.userData, state.stagingPath)
    clearRestoreState(input.userData)
    return
  }

  if (state.phase === 'replacing') {
    try {
      restoreWorkspaceFromRecovery({
        dbPath: input.dbPath,
        documentsRoot: input.documentsRoot,
        recoveryPath: state.recoveryPath
      })
    } catch (error) {
      console.error('[matterdock] restore rollback failed', error)
      throw error instanceof AppError
        ? new AppError(USER_ERRORS.restoreInterruptedFatal, error.code, { cause: error })
        : new AppError(USER_ERRORS.restoreInterruptedFatal, 'RESTORE_ROLLBACK_FAILED', { cause: error })
    }
    cleanupOwnedStaging(input.userData, state.stagingPath)
    clearRestoreState(input.userData)
    return
  }

  if (state.phase === 'committed') {
    try {
      promoteRecovery(input.userData, state.recoveryPath)
      cleanupOwnedStaging(input.userData, state.stagingPath)
      clearRestoreState(input.userData)
    } catch (error) {
      console.error('[matterdock] committed restore housekeeping failed', error)
    }
  }
}
