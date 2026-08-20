import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { AppError, USER_ERRORS } from '@shared/errors'
import type { BackupInspectResult, BackupSummary } from '@shared/backup'
import { createId } from '../db/ids'
import type { DatabaseStore } from '../db/store'
import { createBackupBundle } from './create'
import { createDataExport } from './export'
import { inspectBackupArchive, restoreFromStaging, type RestoreHooks } from './restore'

export type BackupWorkspaceOptions = {
  store: DatabaseStore
  userData: string
  documentsRoot: string
  appVersion: string
}

type PendingInspect = {
  token: string
  archivePath: string
  stagingDir: string
  summary: BackupSummary
}

export class BackupWorkspace {
  private pending: PendingInspect | null = null
  private lastCreatedPath: string | null = null
  private lastExportPath: string | null = null

  constructor(private readonly options: BackupWorkspaceOptions) {}

  async create(destinationPath: string): Promise<string> {
    await createBackupBundle({
      store: this.options.store,
      documentsRoot: this.options.documentsRoot,
      destinationPath,
      appVersion: this.options.appVersion
    })
    this.lastCreatedPath = destinationPath
    return destinationPath
  }

  async inspect(archivePath: string): Promise<Exclude<BackupInspectResult, { canceled: true }>> {
    this.clearPending()
    const token = createId()
    const restoreRoot = join(this.options.userData, 'restore')
    mkdirSync(restoreRoot, { recursive: true })
    const stagingDir = mkdtempSync(join(restoreRoot, 'inspect-'))
    try {
      const { summary } = await inspectBackupArchive({ archivePath, stagingDir })
      this.pending = { token, archivePath, stagingDir, summary }
      return { canceled: false, token, summary }
    } catch (error) {
      rmSync(stagingDir, { recursive: true, force: true })
      throw error
    }
  }

  async restore(token: string, hooks?: RestoreHooks): Promise<void> {
    const pending = this.pending
    if (!pending || pending.token !== token) {
      throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_RESTORE_TOKEN')
    }
    try {
      await restoreFromStaging({
        store: this.options.store,
        userData: this.options.userData,
        documentsRoot: this.options.documentsRoot,
        stagingDir: pending.stagingDir,
        hooks
      })
    } finally {
      this.pending = null
    }
  }

  async exportData(destinationDirectory: string): Promise<string> {
    const path = await createDataExport({
      store: this.options.store,
      documentsRoot: this.options.documentsRoot,
      destinationDirectory,
      appVersion: this.options.appVersion
    })
    this.lastExportPath = path
    return path
  }

  lastBackupPath(): string | null {
    return this.lastCreatedPath
  }

  lastDataExportPath(): string | null {
    return this.lastExportPath
  }

  clearPending(): void {
    if (this.pending) {
      rmSync(this.pending.stagingDir, { recursive: true, force: true })
      this.pending = null
    }
  }
}
