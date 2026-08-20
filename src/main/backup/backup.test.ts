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
import { crc32 } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { USER_ERRORS } from '@shared/errors'
import { persistDatabase } from '../db/open'
import { DatabaseStore } from '../db/store'
import * as matters from '../db/matters'
import * as organisations from '../db/organisations'
import * as contacts from '../db/contacts'
import * as events from '../db/events'
import * as tasks from '../db/tasks'
import * as documentsDb from '../db/documents'
import { createDocumentService } from '../documents/service'
import { createBackupBundle } from './create'
import { inspectBackupArchive, restoreFromStaging } from './restore'
import { extractBackupZip, listZipEntries, writeZip } from './zip'
import { serializeManifest, type BackupManifestV1 } from './manifest'
import { sha256File } from './hash'
import { DATABASE_ENTRY, MANIFEST_ENTRY } from './paths'
import { reconcileInterruptedRestore, writeRestoreState } from './recovery'
import { migrations } from '../db/migrations'
import initSqlJs from 'sql.js'
import { migrate } from '../db/migrate'

const dirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

async function setup() {
  process.env.MATTERDOCK_DISABLE_SEED = '1'
  const userData = tempDir('matterdock-backup-')
  const sourceDir = tempDir('matterdock-backup-src-')
  const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
  await store.initialize()
  const documentsRoot = join(userData, 'documents')
  const service = createDocumentService(store, documentsRoot)
  const org = store.mutate((db) => organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' }))
  store.mutate((db) => organisations.addAlias(db, org.id, '積金易'))
  const contact = store.mutate((db) =>
    contacts.createContact(db, {
      name: 'Alex Chan',
      organisationId: org.id,
      email: 'alex@example.com'
    })
  )
  const matter = store.mutate((db) =>
    matters.createMatter(db, {
      title: 'EMPF Subsidy Application',
      organisationId: org.id,
      reference: 'EMPF-2026-00123'
    })
  )
  store.mutate((db) => matters.linkMatterContact(db, { matterId: matter.id, contactId: contact.id, role: 'Officer' }))
  store.mutate((db) =>
    events.createEvent(db, {
      matterId: matter.id,
      type: 'note',
      body: 'Submitted the application.'
    })
  )
  store.mutate((db) =>
    tasks.createAction(db, {
      matterId: matter.id,
      title: 'Call case officer',
      setAsNextAction: true
    })
  )
  store.mutate((db) =>
    tasks.createWaiting(db, {
      matterId: matter.id,
      title: 'Await acknowledgement',
      waitingForText: 'eMPF'
    })
  )
  const referencePath = join(sourceDir, 'subsidy-letter.pdf')
  const copyPath = join(sourceDir, 'subsidy-confirmation.pdf')
  writeFileSync(referencePath, 'REFERENCE-ORIGINAL-SECRET')
  writeFileSync(copyPath, 'MANAGED-COPY-BYTES')
  const reference = service.addReference({ matterId: matter.id, path: referencePath })
  const copy = service.addCopy({ matterId: matter.id, path: copyPath })
  return { userData, sourceDir, store, documentsRoot, service, org, contact, matter, reference, copy, referencePath, copyPath }
}

function makeStoredZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = entry.data
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    const localFile = Buffer.concat([local, name, data])
    locals.push(localFile)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([central, name]))
    offset += localFile.length
  }
  const localBuf = Buffer.concat(locals)
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(localBuf.length, 16)
  return Buffer.concat([localBuf, centralBuf, eocd])
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

describe('MatterDock backup bundles', () => {
  it('round-trips the database and managed copies and excludes reference originals', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'MatterDock-test.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    expect(existsSync(destination)).toBe(true)
    const entries = await listZipEntries(destination)
    const names = entries.map((entry) => entry.fileName)
    expect(names).toContain('manifest.json')
    expect(names).toContain('database.sqlite')
    expect(names.some((name) => name.startsWith(`documents/${ctx.copy.id}/`))).toBe(true)
    expect(names.some((name) => name.includes('subsidy-letter.pdf'))).toBe(false)

    const staging = tempDir('matterdock-backup-extract-')
    await extractBackupZip(destination, staging)
    const manifest = JSON.parse(readFileSync(join(staging, 'manifest.json'), 'utf8')) as BackupManifestV1
    expect(manifest.backupSchemaVersion).toBe(1)
    expect(manifest.counts.managedDocuments).toBe(1)
    expect(manifest.managedDocuments).toHaveLength(1)
    const managedFile = join(staging, ...manifest.managedDocuments[0]!.path.split('/'))
    expect(readFileSync(managedFile, 'utf8')).toBe('MANAGED-COPY-BYTES')
  })

  it('fails when a managed copy is missing and does not write a backup', async () => {
    const ctx = await setup()
    rmSync(join(ctx.documentsRoot, ctx.copy.id), { recursive: true, force: true })
    const destination = join(ctx.userData, 'missing.matterdock-backup')
    await expect(
      createBackupBundle({
        store: ctx.store,
        documentsRoot: ctx.documentsRoot,
        destinationPath: destination,
        appVersion: '0.6.0'
      })
    ).rejects.toThrow(USER_ERRORS.backupManagedMissing)
    expect(existsSync(destination)).toBe(false)
    expect(existsSync(`${destination}.tmp`)).toBe(false)
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('EMPF Subsidy Application')
  })

  it('still backs up when a referenced original is missing', async () => {
    const ctx = await setup()
    rmSync(ctx.referencePath)
    const destination = join(ctx.userData, 'ref-missing.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    expect(existsSync(destination)).toBe(true)
    const names = (await listZipEntries(destination)).map((entry) => entry.fileName)
    expect(names).toContain('database.sqlite')
  })
})

describe('backup restore validation', () => {
  it('restores a previous workspace and drops later mutations', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'roundtrip.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Changed title' }))
    const extra = ctx.store.mutate((db) => matters.createMatter(db, { title: 'Matter B' }))
    const staging = tempDir('matterdock-restore-stage-')
    await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    await restoreFromStaging({
      store: ctx.store,
      userData: ctx.userData,
      documentsRoot: ctx.documentsRoot,
      stagingDir: staging
    })
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('EMPF Subsidy Application')
    expect(() => ctx.store.query((db) => matters.getMatter(db, extra.id))).toThrow()
    const restoredCopy = ctx.store.query((db) => documentsDb.getDocument(db, ctx.copy.id))
    expect(readFileSync(join(ctx.documentsRoot, restoredCopy.managedPath ?? ''), 'utf8')).toBe('MANAGED-COPY-BYTES')
  })

  it('rejects a corrupt manifest before touching current data', async () => {
    const ctx = await setup()
    const archive = join(ctx.userData, 'bad-manifest.matterdock-backup')
    writeFileSync(archive, makeStoredZip([{ name: MANIFEST_ENTRY, data: Buffer.from('{not json') }]))
    const staging = tempDir('matterdock-bad-manifest-')
    const title = ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title
    await expect(inspectBackupArchive({ archivePath: archive, stagingDir: staging })).rejects.toThrow()
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe(title)
  })

  it('rejects a database checksum mismatch before mutation', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'hash-db.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    const extracted = tempDir('matterdock-hash-db-')
    await extractBackupZip(destination, extracted)
    const dbPath = join(extracted, DATABASE_ENTRY)
    const bytes = readFileSync(dbPath)
    bytes[40] = bytes[40] ^ 0xff
    writeFileSync(dbPath, bytes)
    const tampered = join(ctx.userData, 'tampered-db.matterdock-backup')
    await writeZip(tampered, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: dbPath, archivePath: DATABASE_ENTRY },
      ...ctx.store
        .query((db) => documentsDb.listAllDocuments(db))
        .filter((doc) => doc.storageMode === 'copy')
        .map((doc) => ({
          realPath: join(extracted, 'documents', doc.id, doc.displayName),
          archivePath: `documents/${doc.id}/${doc.displayName}`
        }))
    ])
    const staging = tempDir('matterdock-hash-db-stage-')
    await expect(inspectBackupArchive({ archivePath: tampered, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupDamaged
    )
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('EMPF Subsidy Application')
  })

  it('rejects a managed file checksum mismatch', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'hash-file.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    const extracted = tempDir('matterdock-hash-file-')
    await extractBackupZip(destination, extracted)
    const managedRel = `documents/${ctx.copy.id}/${ctx.copy.displayName}`
    writeFileSync(join(extracted, ...managedRel.split('/')), 'MANAGED-COPY-TAMPERED')
    const tampered = join(ctx.userData, 'tampered-file.matterdock-backup')
    await writeZip(tampered, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY },
      { realPath: join(extracted, ...managedRel.split('/')), archivePath: managedRel }
    ])
    const staging = tempDir('matterdock-hash-file-stage-')
    await expect(inspectBackupArchive({ archivePath: tampered, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupDamaged
    )
  })

  it('rejects a missing managed file listed in the manifest', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'missing-entry.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    const extracted = tempDir('matterdock-missing-entry-')
    await extractBackupZip(destination, extracted)
    const tampered = join(ctx.userData, 'missing-entry-out.matterdock-backup')
    await writeZip(tampered, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY }
    ])
    const staging = tempDir('matterdock-missing-entry-stage-')
    await expect(inspectBackupArchive({ archivePath: tampered, stagingDir: staging })).rejects.toThrow()
  })

  it('rejects unexpected extra archive entries', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'extra.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    const extracted = tempDir('matterdock-extra-')
    await extractBackupZip(destination, extracted)
    writeFileSync(join(extracted, 'random.exe'), 'MZ')
    const managedRel = `documents/${ctx.copy.id}/${ctx.copy.displayName}`
    const tampered = join(ctx.userData, 'extra-out.matterdock-backup')
    await writeZip(tampered, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY },
      { realPath: join(extracted, ...managedRel.split('/')), archivePath: managedRel },
      { realPath: join(extracted, 'random.exe'), archivePath: 'random.exe' }
    ])
    const staging = tempDir('matterdock-extra-stage-')
    await expect(inspectBackupArchive({ archivePath: tampered, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupInvalid
    )
  })

  it('rejects zip slip and absolute paths without writing outside staging', async () => {
    const outsideDir = tempDir('matterdock-outside-')
    const outside = join(outsideDir, 'outside.txt')
    const archive = join(tempDir('matterdock-slip-'), 'slip.matterdock-backup')
    writeFileSync(
      archive,
      makeStoredZip([
        { name: MANIFEST_ENTRY, data: Buffer.from('{}') },
        { name: '../outside.txt', data: Buffer.from('pwned') }
      ])
    )
    const staging = tempDir('matterdock-slip-stage-')
    await expect(inspectBackupArchive({ archivePath: archive, stagingDir: staging })).rejects.toThrow()
    expect(existsSync(outside)).toBe(false)
    expect(existsSync(join(staging, 'outside.txt'))).toBe(false)

    const abs = join(tempDir('matterdock-abs-'), 'abs.matterdock-backup')
    writeFileSync(
      abs,
      makeStoredZip([
        { name: MANIFEST_ENTRY, data: Buffer.from('{}') },
        { name: 'C:\\evil.txt', data: Buffer.from('nope') }
      ])
    )
    const absStaging = tempDir('matterdock-abs-stage-')
    await expect(inspectBackupArchive({ archivePath: abs, stagingDir: absStaging })).rejects.toThrow()
  })

  it('rejects duplicate archive entries', async () => {
    const archive = join(tempDir('matterdock-dup-'), 'dup.matterdock-backup')
    writeFileSync(
      archive,
      makeStoredZip([
        { name: MANIFEST_ENTRY, data: Buffer.from('{"backupSchemaVersion":1}') },
        { name: MANIFEST_ENTRY, data: Buffer.from('{"backupSchemaVersion":1}') }
      ])
    )
    const staging = tempDir('matterdock-dup-stage-')
    await expect(inspectBackupArchive({ archivePath: archive, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupInvalid
    )
  })

  it('rejects an unsupported backup schema version', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'schema.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    const extracted = tempDir('matterdock-schema-')
    await extractBackupZip(destination, extracted)
    const manifest = JSON.parse(readFileSync(join(extracted, MANIFEST_ENTRY), 'utf8')) as BackupManifestV1
    const newer = { ...manifest, backupSchemaVersion: 99 as unknown as 1 }
    writeFileSync(join(extracted, MANIFEST_ENTRY), serializeManifest(newer as BackupManifestV1))
    const managedRel = `documents/${ctx.copy.id}/${ctx.copy.displayName}`
    const tampered = join(ctx.userData, 'schema-out.matterdock-backup')
    await writeZip(tampered, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY },
      { realPath: join(extracted, ...managedRel.split('/')), archivePath: managedRel }
    ])
    const staging = tempDir('matterdock-schema-stage-')
    await expect(inspectBackupArchive({ archivePath: tampered, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupNewerVersion
    )
  })

  it('rejects a future database schema version', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'future-db.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    const extracted = tempDir('matterdock-future-')
    await extractBackupZip(destination, extracted)
    const SQL = await initSqlJs()
    const db = new SQL.Database(readFileSync(join(extracted, DATABASE_ENTRY)))
    db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (99, ?, ?)', [
      'future',
      new Date().toISOString()
    ])
    writeFileSync(join(extracted, DATABASE_ENTRY), Buffer.from(db.export()))
    db.close()
    const manifest = JSON.parse(readFileSync(join(extracted, MANIFEST_ENTRY), 'utf8')) as BackupManifestV1
    manifest.database.sha256 = await sha256File(join(extracted, DATABASE_ENTRY))
    manifest.database.size = statSync(join(extracted, DATABASE_ENTRY)).size
    writeFileSync(join(extracted, MANIFEST_ENTRY), serializeManifest(manifest))
    const managedRel = `documents/${ctx.copy.id}/${ctx.copy.displayName}`
    const tampered = join(ctx.userData, 'future-out.matterdock-backup')
    await writeZip(tampered, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY },
      { realPath: join(extracted, ...managedRel.split('/')), archivePath: managedRel }
    ])
    const staging = tempDir('matterdock-future-stage-')
    await expect(inspectBackupArchive({ archivePath: tampered, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupNewerVersion
    )
  })

  it('rejects a corrupt sqlite database', async () => {
    const extracted = tempDir('matterdock-corrupt-')
    const garbage = Buffer.from('this is not a sqlite database')
    writeFileSync(join(extracted, DATABASE_ENTRY), garbage)
    const manifest: BackupManifestV1 = {
      backupSchemaVersion: 1,
      app: 'MatterDock',
      appVersion: '0.6.0',
      createdAt: new Date().toISOString(),
      databaseSchemaVersion: 5,
      database: {
        path: DATABASE_ENTRY,
        sha256: await sha256File(join(extracted, DATABASE_ENTRY)),
        size: garbage.length
      },
      counts: { matters: 0, documents: 0, managedDocuments: 0 },
      managedDocuments: []
    }
    writeFileSync(join(extracted, MANIFEST_ENTRY), serializeManifest(manifest))
    const archive = join(extracted, 'corrupt.matterdock-backup')
    await writeZip(archive, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY }
    ])
    const staging = tempDir('matterdock-corrupt-stage-')
    await expect(inspectBackupArchive({ archivePath: archive, stagingDir: staging })).rejects.toThrow()
  })

  it('rejects foreign key violations in the staged database', async () => {
    const extracted = tempDir('matterdock-fk-')
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run('PRAGMA foreign_keys = OFF')
    migrate(db)
    db.run('PRAGMA foreign_keys = OFF')
    db.run(
      `INSERT INTO matters (id, title, organisation_id, reference, status, priority, description, created_at, updated_at, completed_at, archived_at)
       VALUES ('m1', 'Broken', 'missing-org', NULL, 'new', 'normal', NULL, '2026-01-01', '2026-01-01', NULL, NULL)`
    )
    writeFileSync(join(extracted, DATABASE_ENTRY), Buffer.from(db.export()))
    db.close()
    const manifest: BackupManifestV1 = {
      backupSchemaVersion: 1,
      app: 'MatterDock',
      appVersion: '0.6.0',
      createdAt: new Date().toISOString(),
      databaseSchemaVersion: 5,
      database: {
        path: DATABASE_ENTRY,
        sha256: await sha256File(join(extracted, DATABASE_ENTRY)),
        size: statSync(join(extracted, DATABASE_ENTRY)).size
      },
      counts: { matters: 1, documents: 0, managedDocuments: 0 },
      managedDocuments: []
    }
    writeFileSync(join(extracted, MANIFEST_ENTRY), serializeManifest(manifest))
    const archive = join(extracted, 'fk.matterdock-backup')
    await writeZip(archive, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY }
    ])
    const staging = tempDir('matterdock-fk-stage-')
    await expect(inspectBackupArchive({ archivePath: archive, stagingDir: staging })).rejects.toThrow(
      USER_ERRORS.backupDamaged
    )
  })

  it('migrates an older backup database during restore', async () => {
    const userData = tempDir('matterdock-old-')
    const documentsRoot = join(userData, 'documents')
    mkdirSync(documentsRoot, { recursive: true })
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run('PRAGMA foreign_keys = ON')
    db.run(migrations[0].sql)
    db.run(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
    db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, ?, ?)', [
      'foundation',
      '2026-01-01T00:00:00.000Z'
    ])
    db.run(
      `INSERT INTO matters (id, title, organisation_id, reference, status, priority, description, created_at, updated_at, completed_at, archived_at)
       VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Legacy Matter', NULL, NULL, 'new', 'normal', NULL, '2026-01-01', '2026-01-01', NULL, NULL)`
    )
    const extracted = tempDir('matterdock-old-stage-src-')
    writeFileSync(join(extracted, DATABASE_ENTRY), Buffer.from(db.export()))
    db.close()
    const manifest: BackupManifestV1 = {
      backupSchemaVersion: 1,
      app: 'MatterDock',
      appVersion: '0.4.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      databaseSchemaVersion: 1,
      database: {
        path: DATABASE_ENTRY,
        sha256: await sha256File(join(extracted, DATABASE_ENTRY)),
        size: statSync(join(extracted, DATABASE_ENTRY)).size
      },
      counts: { matters: 1, documents: 0, managedDocuments: 0 },
      managedDocuments: []
    }
    writeFileSync(join(extracted, MANIFEST_ENTRY), serializeManifest(manifest))
    const archive = join(userData, 'old.matterdock-backup')
    await writeZip(archive, [
      { realPath: join(extracted, MANIFEST_ENTRY), archivePath: MANIFEST_ENTRY },
      { realPath: join(extracted, DATABASE_ENTRY), archivePath: DATABASE_ENTRY }
    ])
    const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
    await store.initialize()
    store.mutate((db) => matters.createMatter(db, { title: 'Current Matter' }))
    const staging = tempDir('matterdock-old-stage-')
    await inspectBackupArchive({ archivePath: archive, stagingDir: staging })
    await restoreFromStaging({ store, userData, documentsRoot, stagingDir: staging })
    expect(store.query((db) => matters.getMatter(db, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).title).toBe(
      'Legacy Matter'
    )
  })

  it('rolls back to previous data if restore fails after the recovery snapshot', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'rollback.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Changed after backup' }))
    const staging = tempDir('matterdock-rollback-stage-')
    await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    await expect(
      restoreFromStaging({
        store: ctx.store,
        userData: ctx.userData,
        documentsRoot: ctx.documentsRoot,
        stagingDir: staging,
        hooks: {
          afterRecoverySnapshot: () => {
            throw new Error('injected failure')
          }
        }
      })
    ).rejects.toThrow(USER_ERRORS.restoreFailedRecovered)
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('Changed after backup')
  })

  it('rolls back after a failure during activation', async () => {
    const ctx = await setup()
    const destination = join(ctx.userData, 'rollback-activate.matterdock-backup')
    await createBackupBundle({
      store: ctx.store,
      documentsRoot: ctx.documentsRoot,
      destinationPath: destination,
      appVersion: '0.6.0'
    })
    ctx.store.mutate((db) => matters.updateMatter(db, ctx.matter.id, { title: 'Keep me' }))
    const staging = tempDir('matterdock-rollback-act-')
    await inspectBackupArchive({ archivePath: destination, stagingDir: staging })
    await expect(
      restoreFromStaging({
        store: ctx.store,
        userData: ctx.userData,
        documentsRoot: ctx.documentsRoot,
        stagingDir: staging,
        hooks: {
          afterActivate: () => {
            throw new Error('injected activate failure')
          }
        }
      })
    ).rejects.toThrow(USER_ERRORS.restoreFailedRecovered)
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('Keep me')
  })

  it('reconciles an interrupted replacing restore from the recovery snapshot', async () => {
    const ctx = await setup()
    const recoveryPath = join(ctx.userData, 'recovery', 'pre-restore-test')
    mkdirSync(recoveryPath, { recursive: true })
    ctx.store.persist()
    writeFileSync(join(recoveryPath, 'matterdock.sqlite'), readFileSync(ctx.store.path()))
    mkdirSync(join(recoveryPath, 'documents'), { recursive: true })
    writeRestoreState(ctx.userData, {
      phase: 'replacing',
      stagingPath: join(ctx.userData, 'restore', 'gone'),
      recoveryPath,
      startedAt: new Date().toISOString()
    })
    writeFileSync(ctx.store.path(), 'broken')
    await ctx.store.closeMemory()
    await reconcileInterruptedRestore({
      userData: ctx.userData,
      dbPath: ctx.store.path(),
      documentsRoot: ctx.documentsRoot
    })
    await ctx.store.initialize({ seed: false })
    expect(ctx.store.query((db) => matters.getMatter(db, ctx.matter.id)).title).toBe('EMPF Subsidy Application')
  })
})
