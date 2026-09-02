import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { globalSearch } from './search'
import { appliedVersions, migrate } from './migrate'
import { migrations } from './migrations'
import { get } from './sql'
import { persistDatabase } from './open'
import { DatabaseStore } from './store'
import * as contacts from './contacts'
import * as documents from './documents'
import * as events from './events'
import * as matters from './matters'
import * as organisations from './organisations'
import * as tasks from './tasks'
import { createMatterDeletionService } from '../matters/service'
import type { MatterRow } from './mappers'

async function emptyDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  return db
}

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('migration v6', () => {
  it('upgrades a v5 database without changing Matter workflow or archive history', async () => {
    const db = await emptyDb()
    for (const migration of migrations.slice(0, 5)) {
      db.run(migration.sql)
    }
    db.run(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`
    )
    for (const [version, name] of [
      [1, 'foundation'],
      [2, 'archive_previous_status'],
      [3, 'matter_timeline'],
      [4, 'tasks_waiting_next_action'],
      [5, 'documents']
    ] as const) {
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        version,
        name,
        '2026-09-01T00:00:00.000Z'
      ])
    }

    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    const waiting = matters.createMatter(db, {
      title: 'EMPF Subsidy Application',
      organisationId: org.id,
      status: 'waiting'
    })
    const archived = matters.archiveMatter(
      db,
      matters.createMatter(db, { title: 'Completed archive', organisationId: org.id, status: 'completed' }).id
    )
    events.createEvent(db, { matterId: waiting.id, type: 'note', body: 'Prepared documents.' })
    tasks.createAction(db, { matterId: waiting.id, title: 'Send pack', setAsNextAction: true })

    const beforeWaiting = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [waiting.id])
    const beforeArchived = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [archived.id])
    expect(beforeWaiting?.status).toBe('waiting')
    expect(beforeArchived?.status).toBe('archived')
    expect(beforeArchived?.status_before_archive).toBe('completed')
    expect(beforeArchived?.completed_at).toBeTruthy()
    expect('trashed_at' in (beforeWaiting ?? {})).toBe(false)

    expect(appliedVersions(db)).toEqual([1, 2, 3, 4, 5])
    expect(migrate(db)).toEqual([6])

    const columns = db.exec('PRAGMA table_info(matters)')[0].values.map((row) => row[1])
    expect(columns).toContain('trashed_at')

    const afterWaiting = matters.getMatter(db, waiting.id)
    const afterArchived = matters.getMatter(db, archived.id)
    expect(afterWaiting.status).toBe('waiting')
    expect(afterWaiting.trashedAt).toBeNull()
    expect(afterArchived.status).toBe('archived')
    expect(afterArchived.completedAt).toBe(beforeArchived?.completed_at ?? null)
    expect(afterArchived.archivedAt).toBe(beforeArchived?.archived_at ?? null)
    expect(afterArchived.trashedAt).toBeNull()
    expect(get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [archived.id])?.status_before_archive).toBe(
      'completed'
    )
    expect(events.listEventsForMatter(db, waiting.id)).toHaveLength(1)
    expect(tasks.getNextActionForMatter(db, waiting.id)?.title).toBe('Send pack')
  })

  it('applies v6 on a fresh database and leaves new Matters live', async () => {
    const db = await emptyDb()
    expect(migrate(db)).toEqual([1, 2, 3, 4, 5, 6])
    const matter = matters.createMatter(db, { title: 'Fresh Matter', status: 'in_progress' })
    expect(matter.trashedAt).toBeNull()
    expect(matters.listMatters(db, { status: 'all' }).map((item) => item.id)).toEqual([matter.id])
    expect(matters.listMatters(db, { scope: 'trash', status: 'all' })).toHaveLength(0)
  })

  it('opens a v0.8.0-compatible v5 database, preserves work, and supports the v0.9.0 lifecycle', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'matterdock-v08-upgrade-'))
    tempDirectories.push(userData)
    const sourceDirectory = mkdtempSync(join(tmpdir(), 'matterdock-v08-upgrade-src-'))
    tempDirectories.push(sourceDirectory)
    const dbPath = join(userData, 'matterdock.sqlite')
    const documentsRoot = join(userData, 'documents')
    mkdirSync(documentsRoot, { recursive: true })
    const referencePath = join(sourceDirectory, 'legacy-reference.txt')
    writeFileSync(referencePath, 'LEGACY-REFERENCE')

    const SQL = await initSqlJs()
    const legacyDb = new SQL.Database()
    legacyDb.run('PRAGMA foreign_keys = ON')
    for (const migration of migrations.slice(0, 5)) legacyDb.run(migration.sql)
    legacyDb.run(
      `CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`
    )
    for (const [version, name] of [
      [1, 'foundation'],
      [2, 'archive_previous_status'],
      [3, 'matter_timeline'],
      [4, 'tasks_waiting_next_action'],
      [5, 'documents']
    ] as const) {
      legacyDb.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        version,
        name,
        '2026-08-31T00:00:00.000Z'
      ])
    }

    const organisation = organisations.createOrganisation(legacyDb, { name: 'Legacy Organisation' })
    organisations.addAlias(legacyDb, organisation.id, 'Legacy Org')
    const contact = contacts.createContact(legacyDb, {
      name: 'Legacy Contact',
      organisationId: organisation.id,
      email: 'legacy@example.com'
    })
    const live = matters.createMatter(legacyDb, {
      title: 'Legacy waiting Matter',
      organisationId: organisation.id,
      status: 'waiting',
      reference: 'LEGACY-LIVE',
      tagNames: ['Shared release tag']
    })
    matters.linkMatterContact(legacyDb, { matterId: live.id, contactId: contact.id, role: 'Case officer' })
    tasks.createWaiting(legacyDb, {
      matterId: live.id,
      title: 'Check the legacy response',
      waitingForText: 'Legacy Contact',
      dueAt: new Date(2026, 8, 2, 18, 0, 0).toISOString()
    })
    tasks.createAction(legacyDb, {
      matterId: live.id,
      title: 'Send legacy follow-up',
      setAsNextAction: true,
      dueAt: new Date(2026, 8, 1, 10, 0, 0).toISOString()
    })
    events.createEvent(legacyDb, {
      matterId: live.id,
      type: 'email',
      direction: 'incoming',
      body: 'Legacy email body',
      email: {
        subject: 'Legacy email subject',
        fromAddress: 'legacy@example.com',
        toAddresses: 'team@example.com',
        ccAddresses: null
      }
    })
    documents.insertDocument(legacyDb, {
      matterId: live.id,
      displayName: 'legacy-reference.txt',
      storageMode: 'reference',
      originalPath: referencePath,
      managedPath: null,
      fileExtension: 'txt',
      mimeType: 'text/plain',
      fileSize: 16,
      notes: 'Legacy reference metadata'
    })

    const archived = matters.createMatter(legacyDb, {
      title: 'Legacy archived Matter',
      organisationId: organisation.id,
      status: 'completed',
      tagNames: ['Shared release tag', 'Archived release tag']
    })
    matters.linkMatterContact(legacyDb, { matterId: archived.id, contactId: contact.id, role: 'Owner' })
    const archivedEvent = events.createEvent(legacyDb, {
      matterId: archived.id,
      type: 'email',
      direction: 'outgoing',
      body: 'Archived legacy email body',
      email: {
        subject: 'Archived legacy email subject',
        fromAddress: 'team@example.com',
        toAddresses: 'legacy@example.com',
        ccAddresses: null
      }
    })
    const archivedTask = tasks.createAction(legacyDb, {
      matterId: archived.id,
      title: 'Archived legacy action',
      setAsNextAction: true
    })
    const archivedReference = documents.insertDocument(legacyDb, {
      matterId: archived.id,
      displayName: 'archived-reference.txt',
      storageMode: 'reference',
      originalPath: referencePath,
      managedPath: null,
      fileExtension: 'txt',
      mimeType: 'text/plain',
      fileSize: 16,
      notes: 'Archived reference metadata'
    })
    const managedDocumentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const managedRelativePath = `${managedDocumentId}/legacy-managed.txt`
    mkdirSync(join(documentsRoot, managedDocumentId), { recursive: true })
    writeFileSync(join(documentsRoot, managedRelativePath), 'LEGACY-MANAGED')
    const archivedCopy = documents.insertDocument(legacyDb, {
      id: managedDocumentId,
      matterId: archived.id,
      displayName: 'legacy-managed.txt',
      storageMode: 'copy',
      originalPath: referencePath,
      managedPath: managedRelativePath,
      fileExtension: 'txt',
      mimeType: 'text/plain',
      fileSize: 14,
      notes: 'Managed legacy metadata'
    })
    const archivedBefore = matters.archiveMatter(legacyDb, archived.id)
    const archivedRowBefore = get<MatterRow>(legacyDb, 'SELECT * FROM matters WHERE id = ?', [archived.id])
    writeFileSync(dbPath, Buffer.from(legacyDb.export()))
    legacyDb.close()

    const store = new DatabaseStore(dbPath, persistDatabase)
    await store.initialize({ seed: false })

    expect(store.query((db) => appliedVersions(db))).toEqual([1, 2, 3, 4, 5, 6])
    const upgradedLive = store.query((db) => matters.getMatter(db, live.id))
    const upgradedArchived = store.query((db) => matters.getMatter(db, archived.id))
    expect(upgradedLive.status).toBe('waiting')
    expect(upgradedLive.trashedAt).toBeNull()
    expect(upgradedArchived.status).toBe('archived')
    expect(upgradedArchived.trashedAt).toBeNull()
    expect(upgradedArchived.completedAt).toBe(archivedBefore.completedAt)
    expect(upgradedArchived.archivedAt).toBe(archivedBefore.archivedAt)
    expect(
      get<MatterRow>(store.query((db) => db), 'SELECT * FROM matters WHERE id = ?', [archived.id])?.status_before_archive
    ).toBe(archivedRowBefore?.status_before_archive)

    expect(upgradedArchived.contacts).toEqual([
      expect.objectContaining({ contactId: contact.id, role: 'Owner' })
    ])
    const archivedEvents = store.query((db) => events.listEventsForMatter(db, archived.id))
    expect(archivedEvents).toEqual([expect.objectContaining({ id: archivedEvent.id, body: 'Archived legacy email body' })])
    expect(archivedEvents[0]?.email).toEqual(
      expect.objectContaining({ subject: 'Archived legacy email subject', fromAddress: 'team@example.com' })
    )
    expect(store.query((db) => tasks.getTask(db, archivedTask.id).title)).toBe('Archived legacy action')
    expect(store.query((db) => documents.getDocument(db, archivedReference.id).notes)).toBe('Archived reference metadata')
    expect(store.query((db) => documents.getDocument(db, archivedCopy.id).managedPath)).toBe(managedRelativePath)
    expect(readFileSync(join(documentsRoot, managedRelativePath), 'utf8')).toBe('LEGACY-MANAGED')

    const now = new Date(2026, 8, 2, 12, 0, 0)
    expect(store.query((db) => matters.listMatters(db, { status: 'all' }).map((item) => item.id))).toEqual(
      expect.arrayContaining([live.id, archived.id])
    )
    expect(store.query((db) => globalSearch(db, 'Legacy waiting')).hits.some((hit) => hit.id === live.id)).toBe(true)
    expect(store.query((db) => globalSearch(db, 'Legacy email subject')).hits.some((hit) => hit.type === 'event')).toBe(true)
    expect(store.query((db) => tasks.getTodayDashboard(db, now).waiting.map((item) => item.matterId))).toContain(live.id)
    expect(store.query((db) => tasks.listWaiting(db, now).followUpDue.map((item) => item.matterId))).toContain(live.id)

    const childSnapshot = store.query((db) => ({
      contacts: db.exec('SELECT * FROM matter_contacts WHERE matter_id = ?', [archived.id])[0]?.values,
      tags: db.exec('SELECT * FROM matter_tags WHERE matter_id = ?', [archived.id])[0]?.values,
      events: events.listEventsForMatter(db, archived.id),
      tasks: tasks.listItemsForMatter(db, archived.id),
      documents: documents.listDocumentsForMatter(db, archived.id)
    }))
    store.mutate((db) => matters.moveMatterToTrash(db, archived.id))
    expect(store.query((db) => matters.getMatter(db, archived.id).trashedAt)).toBeTruthy()
    store.mutate((db) => matters.restoreMatterFromTrash(db, archived.id))
    expect(store.query((db) => matters.getMatter(db, archived.id).trashedAt)).toBeNull()
    expect(store.query((db) => ({
      contacts: db.exec('SELECT * FROM matter_contacts WHERE matter_id = ?', [archived.id])[0]?.values,
      tags: db.exec('SELECT * FROM matter_tags WHERE matter_id = ?', [archived.id])[0]?.values,
      events: events.listEventsForMatter(db, archived.id),
      tasks: tasks.listItemsForMatter(db, archived.id),
      documents: documents.listDocumentsForMatter(db, archived.id)
    }))).toEqual(childSnapshot)
    expect(store.query((db) => matters.getMatter(db, archived.id).status)).toBe('archived')

    store.mutate((db) => matters.moveMatterToTrash(db, archived.id))
    expect(createMatterDeletionService(store, documentsRoot).deletePermanently(archived.id)).toEqual({ id: archived.id })
    expect(existsSync(join(documentsRoot, managedRelativePath))).toBe(false)
    expect(readFileSync(referencePath, 'utf8')).toBe('LEGACY-REFERENCE')
    expect(store.query((db) => matters.getMatter(db, live.id).title)).toBe('Legacy waiting Matter')
    expect(store.query((db) => organisations.getOrganisation(db, organisation.id).id)).toBe(organisation.id)
    expect(store.query((db) => contacts.getContact(db, contact.id).id)).toBe(contact.id)
    expect(store.query((db) => documents.findDocument(db, archivedCopy.id))).toBeNull()
    await store.close()
  })
})
