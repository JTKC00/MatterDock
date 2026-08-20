import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { USER_ERRORS } from '@shared/errors'
import { persistDatabase } from '../db/open'
import { DatabaseStore } from '../db/store'
import * as matters from '../db/matters'
import { createDocumentService } from '../documents/service'
import { createBackupBundle } from './create'
import { createDataExport } from './export'
import { inspectBackupArchive, restoreFromStaging } from './restore'
import { extractBackupZip, writeZip } from './zip'
import { serializeManifest, type BackupManifestV1 } from './manifest'
import { sha256File } from './hash'
import { DATABASE_ENTRY, MANIFEST_ENTRY } from './paths'
import {
  lastPreRestorePath,
  promoteRecovery,
  readRestoreState,
  reconcileInterruptedRestore,
  restoreStatePath,
  writeRestoreState
} from './recovery'

const dirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

async function setup() {
  process.env.MATTERDOCK_DISABLE_SEED = '1'
  const userData = tempDir('matterdock-safety-')
  const sourceDir = tempDir('matterdock-safety-src-')
  const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
  await store.initialize()
  const documentsRoot = join(userData, 'documents')
  const service = createDocumentService(store, documentsRoot)
  const matter = store.mutate((db) => matters.createMatter(db, { title: 'Original Matter' }))
  const copyPath = join(sourceDir, 'report.pdf')
  writeFileSync(copyPath, 'MANAGED-BYTES')
  const copy = service.addCopy({ matterId: matter.id, path: copyPath })
  return { userData, sourceDir, store, documentsRoot, service, matter, copy, copyPath }
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

describe('restore commit boundary', () => {
  it('does not roll back after commit if staging cleanup fails', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'ok.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.1'
    })
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Changed after backup' }))
    const staging = join(ctx.userData, 'restore', 'inspect-commit')
    mkdirSync(staging, { recursive: true })
    await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    await restoreFromStaging({
      store: ctx.store,
      userData: ctx.userData,
      documentsRoot: ctx.documentsRoot,
      stagingDir: staging,
      hooks: {
        afterCommitted: () => {
          throw new Error('cleanup staging failed')
        }
      }
    })
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('Original Matter')
    expect(readRestoreState(ctx.userData)?.phase).toBe('committed')
  })

  it('does not roll back after commit if promotion fails', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'ok2.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.1'
    })
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Keep if rolled back' }))
    const staging = join(ctx.userData, 'restore', 'inspect-promote')
    mkdirSync(staging, { recursive: true })
    await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    await restoreFromStaging({
      store: ctx.store,
      userData: ctx.userData,
      documentsRoot: ctx.documentsRoot,
      stagingDir: staging,
      hooks: {
        afterCommitted: () => {
          rmSync(join(ctx.userData, 'recovery'), { recursive: true, force: true })
          mkdirSync(join(ctx.userData, 'recovery'), { recursive: true })
          throw new Error('promotion failed')
        }
      }
    })
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('Original Matter')
  })

  it('rolls back when verification fails after activation', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'verify.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.1'
    })
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Keep me' }))
    const staging = join(ctx.userData, 'restore', 'inspect-verify')
    mkdirSync(staging, { recursive: true })
    await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    await expect(
      restoreFromStaging({
        store: ctx.store,
        userData: ctx.userData,
        documentsRoot: ctx.documentsRoot,
        stagingDir: staging,
        hooks: {
          afterVerified: () => {
            throw new Error('verification failed')
          }
        }
      })
    ).rejects.toThrow(USER_ERRORS.restoreFailedRecovered)
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('Keep me')
  })
})

describe('recovery promotion and startup', () => {
  it('treats a missing source and existing last-pre-restore as already promoted', async () => {
    const ctx = await setup()
    const last = lastPreRestorePath(ctx.userData)
    mkdirSync(last, { recursive: true })
    writeFileSync(join(last, 'keep.txt'), 'SAFETY')
    writeRestoreState(ctx.userData, {
      phase: 'committed',
      stagingPath: join(ctx.userData, 'restore', 'gone'),
      recoveryPath: join(ctx.userData, 'recovery', 'pre-restore-missing'),
      startedAt: new Date().toISOString()
    })
    mkdirSync(join(ctx.userData, 'restore', 'gone'), { recursive: true })
    await reconcileInterruptedRestore({
      userData: ctx.userData,
      dbPath: ctx.store.path(),
      documentsRoot: ctx.documentsRoot
    })
    expect(existsSync(join(last, 'keep.txt'))).toBe(true)
    expect(readFileSync(join(last, 'keep.txt'), 'utf8')).toBe('SAFETY')
    expect(existsSync(restoreStatePath(ctx.userData))).toBe(false)
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('Original Matter')
  })

  it('promoteRecovery does not delete last-pre-restore when the source is already gone', () => {
    const userData = tempDir('matterdock-promote-')
    const last = lastPreRestorePath(userData)
    mkdirSync(last, { recursive: true })
    writeFileSync(join(last, 'keep.txt'), 'SAFETY')
    promoteRecovery(userData, join(userData, 'recovery', 'pre-restore-absent'))
    expect(readFileSync(join(last, 'keep.txt'), 'utf8')).toBe('SAFETY')
  })

  it('fails closed when replacing recovery cannot restore a workspace', async () => {
    const ctx = await setup()
    writeRestoreState(ctx.userData, {
      phase: 'replacing',
      stagingPath: join(ctx.userData, 'restore', 'stage'),
      recoveryPath: join(ctx.userData, 'recovery', 'missing-snapshot'),
      startedAt: new Date().toISOString()
    })
    mkdirSync(join(ctx.userData, 'restore', 'stage'), { recursive: true })
    await expect(
      reconcileInterruptedRestore({
        userData: ctx.userData,
        dbPath: ctx.store.path(),
        documentsRoot: ctx.documentsRoot
      })
    ).rejects.toThrow(USER_ERRORS.restoreInterruptedFatal)
  })

  it('does not delete an external sentinel from a malicious restore-state path', async () => {
    const ctx = await setup()
    const external = tempDir('matterdock-sentinel-')
    const keep = join(external, 'keep.txt')
    writeFileSync(keep, 'UNTOUCHED')
    writeFileSync(
      restoreStatePath(ctx.userData),
      `${JSON.stringify({
        phase: 'prepared',
        stagingPath: external,
        recoveryPath: external,
        startedAt: new Date().toISOString()
      })}\n`
    )
    await expect(
      reconcileInterruptedRestore({
        userData: ctx.userData,
        dbPath: ctx.store.path(),
        documentsRoot: ctx.documentsRoot
      })
    ).rejects.toThrow(USER_ERRORS.restoreInterruptedFatal)
    expect(readFileSync(keep, 'utf8')).toBe('UNTOUCHED')
    expect(existsSync(external)).toBe(true)
  })
})

describe('temporary path ownership', () => {
  it('does not delete a pre-existing destination.tmp next to a backup', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'keep.matterdock-backup')
    const stray = `${destination}.tmp`
    writeFileSync(stray, 'DO NOT DELETE')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.1'
    })
    expect(readFileSync(stray, 'utf8')).toBe('DO NOT DELETE')
    expect(existsSync(destination)).toBe(true)
  })

  it('leaves a predictable export .tmp folder untouched', async () => {
    const ctx = await setup()
    const destParent = tempDir('matterdock-export-parent-')
    const stray = join(destParent, 'MatterDock-Data-Export-2026-08-20.tmp')
    mkdirSync(stray, { recursive: true })
    writeFileSync(join(stray, 'keep.txt'), 'DO NOT DELETE')
    await createDataExport({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationDirectory: destParent,
      appVersion: '0.6.1',
      now: () => '2026-08-20T12:00:00.000Z'
    })
    expect(readFileSync(join(stray, 'keep.txt'), 'utf8')).toBe('DO NOT DELETE')
  })

  it('keeps an existing good backup when a replacement fails validation', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'final.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.1'
    })
    const original = readFileSync(destination)
    await expect(
      createBackupBundle({
        store: ctx.store,
        documentsRoot: ctx.documentsRoot,
        destinationPath: destination,
        appVersion: '0.6.1',
        hooks: {
          afterZipWrite: (archivePath) => {
            const bytes = readFileSync(archivePath)
            bytes[Math.max(0, bytes.length - 40)] = bytes[Math.max(0, bytes.length - 40)] ^ 0xff
            writeFileSync(archivePath, bytes)
          }
        }
      })
    ).rejects.toThrow()
    expect(Buffer.from(readFileSync(destination))).toEqual(Buffer.from(original))
  })

  it('round-trip validates a generated backup before success', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'roundtrip.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.1'
    })
    const staging = tempDir('matterdock-rt-inspect-')
    const inspected = await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    expect(inspected.summary.managedDocumentCount).toBe(1)
  })
})

describe('strict archive membership and managed path identity', () => {
  it('rejects an extra valid-shaped managed file that is not in the manifest', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'extra.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.1'
    })
    const extracted = tempDir('matterdock-extra-managed-')
    await extractBackupZip(destination, extracted)
    const extraRel = `documents/${ctx.copy.id}/extra.exe`
    writeFileSync(join(extracted, ...extraRel.split('/')), 'MZ')
    const tampered = join(ctx.userData, 'extra-out.matterdock-backup')
    await writeZip(tampered, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY },
      {
        realPath: join(extracted, 'documents', ctx.copy.id, ctx.copy.displayName),
        archivePath: `documents/${ctx.copy.id}/${ctx.copy.displayName}`
      },
      { realPath: join(extracted, ...extraRel.split('/')), archivePath: extraRel }
    ])
    const staging = tempDir('matterdock-extra-stage-')
    await expect(inspectBackupArchive({ archivePath: tampered, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupInvalid
    )
  })

  it('rejects backup when a managed path belongs to a different document id', async () => {
    const ctx = await setup()
    const otherPath = join(ctx.sourceDir, 'other.pdf')
    writeFileSync(otherPath, 'OTHER')
    const other = ctx.service.addCopy({ matterId: ctx.matter.id, path: otherPath })
    ctx.store.mutate((db) => {
      db.run('UPDATE documents SET managed_path = ? WHERE id = ?', [`${other.id}/other.pdf`, ctx.copy.id])
    })
    const destination = join(ctx.userData, 'identity.matterdock-backup')
    await expect(
      createBackupBundle({
        store: ctx.store,
        documentsRoot: ctx.documentsRoot,
        destinationPath: destination,
        appVersion: '0.6.1'
      })
    ).rejects.toThrow(USER_ERRORS.backupFailed)
    expect(existsSync(destination)).toBe(false)
  })

  it('rejects restore inspection when the backup database managed path identity is wrong', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'identity-restore.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.1'
    })
    const extracted = tempDir('matterdock-identity-extract-')
    await extractBackupZip(destination, extracted)
    const SQL = await initSqlJs()
    const db = new SQL.Database(readFileSync(join(extracted, DATABASE_ENTRY)))
    db.run('UPDATE documents SET managed_path = ? WHERE id = ?', [
      '00000000-0000-4000-8000-000000000000/report.pdf',
      ctx.copy.id
    ])
    writeFileSync(join(extracted, DATABASE_ENTRY), Buffer.from(db.export()))
    db.close()
    const manifest = JSON.parse(readFileSync(join(extracted, MANIFEST_ENTRY), 'utf8')) as BackupManifestV1
    manifest.database.sha256 = await sha256File(join(extracted, DATABASE_ENTRY))
    manifest.database.size = statSync(join(extracted, DATABASE_ENTRY)).size
    writeFileSync(join(extracted, MANIFEST_ENTRY), serializeManifest(manifest))
    const tampered = join(ctx.userData, 'identity-out.matterdock-backup')
    await writeZip(tampered, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY },
      {
        realPath: join(extracted, 'documents', ctx.copy.id, ctx.copy.displayName),
        archivePath: `documents/${ctx.copy.id}/${ctx.copy.displayName}`
      }
    ])
    const staging = tempDir('matterdock-identity-stage-')
    await expect(inspectBackupArchive({ archivePath: tampered, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupDamaged
    )
  })
})
