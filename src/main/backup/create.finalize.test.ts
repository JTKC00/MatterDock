import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppError, USER_ERRORS } from '@shared/errors'
import { persistDatabase } from '../db/open'
import { DatabaseStore } from '../db/store'
import * as matters from '../db/matters'
import { createDocumentService } from '../documents/service'
import { createBackupBundle } from './create'
import { inspectBackupArchive } from './restore'

const dirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

async function setup(title: string) {
  process.env.MATTERDOCK_DISABLE_SEED = '1'
  const userData = tempDir('matterdock-finalize-')
  const sourceDir = tempDir('matterdock-finalize-src-')
  const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
  await store.initialize()
  const documentsRoot = join(userData, 'documents')
  const service = createDocumentService(store, documentsRoot)
  const matter = store.mutate((db) => matters.createMatter(db, { title }))
  const copyPath = join(sourceDir, 'report.pdf')
  writeFileSync(copyPath, `BYTES-${title}`)
  service.addCopy({ matterId: matter.id, path: copyPath })
  return { userData, store, documentsRoot, matter, sourceDir }
}

beforeEach(() => {
  process.env.MATTERDOCK_DISABLE_SEED = '1'
})

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('backup finalization safety', () => {
  it('keeps backup A at the destination when replacement fails before finalization', async () => {
    const ctx = await setup('Backup A')
    const destination = join(ctx.userData, 'final.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.2'
    })
    const original = readFileSync(destination)
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Backup B' }))
    await expect(
      createBackupBundle({
        store: ctx.store,
        documentsRoot: ctx.documentsRoot,
        destinationPath: destination,
        appVersion: '0.6.2',
        hooks: {
          afterZipWrite: (archivePath) => {
            const bytes = readFileSync(archivePath)
            bytes[Math.max(0, bytes.length - 40)] ^= 0xff
            writeFileSync(archivePath, bytes)
          }
        }
      })
    ).rejects.toThrow()
    expect(Buffer.from(readFileSync(destination))).toEqual(Buffer.from(original))
    const staging = tempDir('inspect-a-')
    const inspected = await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    expect(inspected.summary.matterCount).toBe(1)
  })

  it('restores backup A when the candidate cannot replace the final path', async () => {
    const ctx = await setup('Backup A')
    const destination = join(ctx.userData, 'replace.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.2'
    })
    const original = readFileSync(destination)
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Backup B' }))
    await expect(
      createBackupBundle({
        store: ctx.store,
        documentsRoot: ctx.documentsRoot,
        destinationPath: destination,
        appVersion: '0.6.2',
        hooks: {
          failCandidateRename: () => {
            throw new Error('candidate rename failed')
          }
        }
      })
    ).rejects.toThrow(USER_ERRORS.backupFailed)
    expect(Buffer.from(readFileSync(destination))).toEqual(Buffer.from(original))
    const staging = tempDir('inspect-restore-a-')
    await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
  })

  it('preserves a valid recovery copy when replacement and rollback both fail', async () => {
    const ctx = await setup('Backup A')
    const destination = join(ctx.userData, 'double.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.2'
    })
    const original = readFileSync(destination)
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Backup B' }))
    let caught: unknown
    try {
      await createBackupBundle({
        store: ctx.store,
        documentsRoot: ctx.documentsRoot,
        destinationPath: destination,
        appVersion: '0.6.2',
        hooks: {
          failCandidateRename: () => {
            throw new Error('candidate rename failed')
          },
          failOldRestore: () => {
            throw new Error('old restore failed')
          }
        }
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AppError)
    const error = caught as AppError
    expect(error.message).toBe(USER_ERRORS.backupPreviousPreserved)
    expect(error.recoveryPath).toBeTruthy()
    expect(existsSync(error.recoveryPath ?? '')).toBe(true)
    expect(Buffer.from(readFileSync(error.recoveryPath ?? ''))).toEqual(Buffer.from(original))
    const staging = tempDir('inspect-recovery-')
    await inspectBackupArchive({ archivePath: error.recoveryPath ?? '', stagingDir: staging })
    expect(existsSync(error.recoveryPath ?? '')).toBe(true)
  })

  it('still reports success if housekeeping fails after the new backup is committed', async () => {
    const ctx = await setup('Backup A')
    const destination = join(ctx.userData, 'commit.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.2'
    })
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Backup B' }))
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.2',
      hooks: {
        failCleanup: () => {
          throw new Error('cleanup failed')
        }
      }
    })
    expect(existsSync(destination)).toBe(true)
    const staging = tempDir('inspect-b-')
    const inspected = await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    expect(inspected.summary.matterCount).toBe(1)
  })

  it('does not touch a pre-existing destination.tmp file', async () => {
    const ctx = await setup('Backup A')
    const destination = join(ctx.userData, 'keep.matterdock-backup')
    const stray = `${destination}.tmp`
    writeFileSync(stray, 'DO NOT DELETE')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.2'
    })
    expect(readFileSync(stray, 'utf8')).toBe('DO NOT DELETE')
    const staging = tempDir('inspect-tmp-')
    await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
  })

  it('does not leave recovery files inside the deleted staging directory', async () => {
    const ctx = await setup('Backup A')
    const destination = join(ctx.userData, 'owned.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.2'
    })
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Backup B' }))
    let recoveryPath = ''
    try {
      await createBackupBundle({
        store: ctx.store,
        documentsRoot: ctx.documentsRoot,
        destinationPath: destination,
        appVersion: '0.6.2',
        hooks: {
          failCandidateRename: () => {
            throw new Error('candidate rename failed')
          },
          failOldRestore: () => {
            throw new Error('old restore failed')
          }
        }
      })
    } catch (error) {
      recoveryPath = error instanceof AppError ? (error.recoveryPath ?? '') : ''
    }
    expect(recoveryPath.includes('.matterdock-backup-recovery-') || recoveryPath.includes('.matterdock-owned-')).toBe(
      true
    )
    expect(dirname(recoveryPath) === ctx.userData || dirname(dirname(recoveryPath)) === ctx.userData).toBe(true)
    expect(existsSync(recoveryPath)).toBe(true)
  })
})
