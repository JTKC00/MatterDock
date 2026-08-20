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
import { dirname, join } from 'node:path'
import { AppError, USER_ERRORS } from '@shared/errors'

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

export function readRestoreState(userData: string): RestoreState | null {
  const path = restoreStatePath(userData)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<RestoreState>
    if (!RESTORE_PHASES.includes(parsed.phase as RestorePhase)) return null
    if (typeof parsed.stagingPath !== 'string' || typeof parsed.recoveryPath !== 'string') return null
    if (typeof parsed.startedAt !== 'string') return null
    return parsed as RestoreState
  } catch (error) {
    console.error('[matterdock] restore-state could not be read', error)
    return null
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
  if (last === recoveryPath) return
  mkdirSync(recoveryRoot(userData), { recursive: true })
  if (existsSync(last)) rmSync(last, { recursive: true, force: true })
  if (existsSync(recoveryPath)) renameSync(recoveryPath, last)
}

export function cleanupRestoreWork(stagingPath: string): void {
  rmSync(stagingPath, { recursive: true, force: true })
}

export async function reconcileInterruptedRestore(input: {
  userData: string
  dbPath: string
  documentsRoot: string
}): Promise<void> {
  const state = readRestoreState(input.userData)
  if (!state) {
    const leftoverStaging = join(input.userData, 'restore')
    if (existsSync(leftoverStaging)) {
      rmSync(leftoverStaging, { recursive: true, force: true })
    }
    return
  }

  if (state.phase === 'prepared') {
    cleanupRestoreWork(state.stagingPath)
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
      cleanupRestoreWork(state.stagingPath)
      clearRestoreState(input.userData)
    } catch (error) {
      console.error('[matterdock] restore rollback failed', error)
      throw error instanceof AppError
        ? error
        : new AppError(USER_ERRORS.restoreFailedUnrecovered, 'RESTORE_ROLLBACK_FAILED', { cause: error })
    }
    return
  }

  if (state.phase === 'committed') {
    try {
      promoteRecovery(input.userData, state.recoveryPath)
      cleanupRestoreWork(state.stagingPath)
    } finally {
      clearRestoreState(input.userData)
    }
  }
}
