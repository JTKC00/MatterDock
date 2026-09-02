import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import { MATTER_STATUSES } from '@shared/types'
import { persistDatabase } from './open'
import { DatabaseStore } from './store'
import * as contacts from './contacts'
import * as documents from './documents'
import * as events from './events'
import { migrate } from './migrate'
import * as matters from './matters'
import * as organisations from './organisations'
import { globalSearch } from './search'
import * as tasks from './tasks'
import { get } from './sql'
import type { MatterRow } from './mappers'
import { createDocumentService } from '../documents/service'
import { createMatterDeletionService } from '../matters/service'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

async function memoryDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

function count(db: Awaited<ReturnType<typeof memoryDb>>, table: string, column: string, id: string): number {
  const rows = db.exec(`SELECT COUNT(*) FROM ${table} WHERE ${column} = ?`, [id])
  return Number(rows[0]?.values[0]?.[0] ?? 0)
}

describe('Matter Trash database primitives', () => {
  it('does not treat Trash as a Matter workflow status', () => {
    expect(MATTER_STATUSES).not.toContain('trashed')
  })

  it('moves and restores an active Matter without changing workflow fields or child rows', async () => {
    const db = await memoryDb()
    const organisation = organisations.createOrganisation(db, { name: 'Shared Organisation' })
    const contact = contacts.createContact(db, { name: 'Shared Contact', organisationId: organisation.id })
    const live = matters.createMatter(db, { title: 'Keep live', organisationId: organisation.id })
    const matter = matters.createMatter(db, {
      title: 'Active origin',
      organisationId: organisation.id,
      status: 'in_progress',
      tagNames: ['Shared Tag']
    })
    matters.linkMatterContact(db, { matterId: matter.id, contactId: contact.id, role: 'Owner' })
    const event = events.createEvent(db, { matterId: matter.id, type: 'note', body: 'Keep this note' })
    const action = tasks.createAction(db, { matterId: matter.id, title: 'Keep this action', setAsNextAction: true })
    documents.insertDocument(db, {
      matterId: matter.id,
      displayName: 'keep.pdf',
      storageMode: 'reference',
      originalPath: 'C:/original/keep.pdf',
      managedPath: null,
      fileExtension: 'pdf',
      mimeType: 'application/pdf',
      fileSize: 10
    })

    const before = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [matter.id])
    const trashed = matters.moveMatterToTrash(db, matter.id)
    expect(trashed.trashedAt).toBeTruthy()
    expect(trashed.status).toBe('in_progress')
    expect(trashed.completedAt).toBeNull()
    expect(trashed.archivedAt).toBeNull()
    expect(get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [matter.id])?.status_before_archive).toBe(
      before?.status_before_archive ?? null
    )
    expect(count(db, 'events', 'matter_id', matter.id)).toBe(1)
    expect(count(db, 'tasks', 'matter_id', matter.id)).toBe(1)
    expect(count(db, 'documents', 'matter_id', matter.id)).toBe(1)
    expect(count(db, 'matter_contacts', 'matter_id', matter.id)).toBe(1)
    expect(count(db, 'matter_tags', 'matter_id', matter.id)).toBe(1)
    expect(events.getEvent(db, event.id).body).toBe('Keep this note')
    expect(tasks.getTask(db, action.id).title).toBe('Keep this action')

    expect(matters.listMatters(db, { status: 'active' }).map((item) => item.id)).toEqual([live.id])
    expect(matters.listMatters(db, { status: 'all' }).map((item) => item.id)).toEqual([live.id])
    expect(matters.listMatters(db, { status: 'in_progress' }).map((item) => item.id)).toEqual([])
    expect(matters.listMatters(db, { scope: 'trash', status: 'all' }).map((item) => item.id)).toEqual([matter.id])

    const again = matters.moveMatterToTrash(db, matter.id)
    expect(again.trashedAt).toBe(trashed.trashedAt)

    const restored = matters.restoreMatterFromTrash(db, matter.id)
    expect(restored.trashedAt).toBeNull()
    expect(restored.status).toBe('in_progress')
    expect(restored.completedAt).toBeNull()
    expect(restored.archivedAt).toBeNull()
    expect(count(db, 'events', 'matter_id', matter.id)).toBe(1)
    expect(count(db, 'tasks', 'matter_id', matter.id)).toBe(1)
    expect(count(db, 'documents', 'matter_id', matter.id)).toBe(1)
    expect(matters.listMatters(db, { status: 'in_progress' }).map((item) => item.id)).toContain(matter.id)
    expect(matters.listMatters(db, { scope: 'trash', status: 'all' })).toHaveLength(0)

    const noop = matters.restoreMatterFromTrash(db, matter.id)
    expect(noop.trashedAt).toBeNull()
    expect(matters.getMatter(db, live.id).title).toBe('Keep live')
  })

  it('restores an archived-origin Matter with archive history intact', async () => {
    const db = await memoryDb()
    const created = matters.createMatter(db, { title: 'Archived origin', status: 'completed' })
    const archived = matters.archiveMatter(db, created.id)
    const before = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [archived.id])
    expect(before?.status_before_archive).toBe('completed')

    const trashed = matters.moveMatterToTrash(db, archived.id)
    expect(trashed.status).toBe('archived')
    expect(trashed.archivedAt).toBe(archived.archivedAt)
    expect(trashed.completedAt).toBe(archived.completedAt)
    expect(get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [archived.id])?.status_before_archive).toBe(
      'completed'
    )
    expect(matters.listMatters(db, { status: 'archived' })).toHaveLength(0)
    expect(matters.listMatters(db, { scope: 'trash', status: 'all' })[0]?.id).toBe(archived.id)

    const restored = matters.restoreMatterFromTrash(db, archived.id)
    expect(restored.status).toBe('archived')
    expect(restored.archivedAt).toBe(archived.archivedAt)
    expect(restored.completedAt).toBe(archived.completedAt)
    expect(restored.trashedAt).toBeNull()
    expect(get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [archived.id])?.status_before_archive).toBe(
      'completed'
    )
  })

  it('raises the existing Matter-not-found error for missing ids', async () => {
    const db = await memoryDb()
    const missingId = '550e8400-e29b-41d4-a716-446655440000'
    expect(() => matters.moveMatterToTrash(db, missingId)).toThrow(USER_ERRORS.matterNotFound)
    expect(() => matters.restoreMatterFromTrash(db, missingId)).toThrow(USER_ERRORS.matterNotFound)
    try {
      matters.moveMatterToTrash(db, missingId)
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('MATTER_NOT_FOUND')
    }
  })
})

describe('Matter Trash live-query isolation', () => {
  it('hides trashed Matters from live surfaces and restores them intact', async () => {
    const db = await memoryDb()
    const now = new Date('2026-09-02T12:00:00.000Z')
    const organisation = organisations.createOrganisation(db, { name: 'CLP Power Hong Kong Limited' })
    organisations.addAlias(db, organisation.id, '中電')
    const contact = contacts.createContact(db, { name: 'Ms Chan', organisationId: organisation.id })
    const live = matters.createMatter(db, {
      title: 'Live Matter',
      organisationId: organisation.id,
      tagNames: ['Shared']
    })
    const hidden = matters.createMatter(db, {
      title: 'Hidden Trash Matter',
      organisationId: organisation.id,
      reference: 'TRASH-001',
      status: 'waiting',
      tagNames: ['Shared', 'Hidden']
    })
    matters.linkMatterContact(db, { matterId: hidden.id, contactId: contact.id, role: 'Officer' })
    matters.linkMatterContact(db, { matterId: live.id, contactId: contact.id, role: 'Reviewer' })
    events.createEvent(db, {
      matterId: hidden.id,
      type: 'email',
      direction: 'incoming',
      body: 'Unique trash timeline body',
      email: {
        subject: 'Unique trash subject',
        fromAddress: 'a@example.com',
        toAddresses: 'team@example.com',
        ccAddresses: null
      }
    })
    tasks.createWaiting(db, {
      matterId: hidden.id,
      title: 'Unique trash waiting',
      waitingForText: 'Ms Chan',
      dueAt: now.toISOString()
    })
    documents.insertDocument(db, {
      matterId: hidden.id,
      displayName: 'unique-trash-file.pdf',
      storageMode: 'reference',
      originalPath: 'C:/original/unique-trash-file.pdf',
      managedPath: null,
      fileExtension: 'pdf',
      mimeType: 'application/pdf',
      fileSize: 12
    })

    matters.moveMatterToTrash(db, hidden.id)

    expect(matters.listMatters(db, { status: 'all' }).map((item) => item.id)).toEqual([live.id])
    expect(matters.listMatters(db, { status: 'active' }).map((item) => item.id)).toEqual([live.id])
    expect(matters.listMatters(db, { status: 'waiting' })).toHaveLength(0)
    const tag = hidden.tags.find((item) => item.name === 'Hidden')
    expect(tag).toBeTruthy()
    expect(matters.listMatters(db, { tagId: tag?.id }).map((item) => item.id)).toEqual([])
    expect(matters.listMatters(db, { search: 'Hidden Trash' })).toHaveLength(0)
    expect(matters.listMatters(db, { scope: 'trash', status: 'all', search: 'TRASH-001' })[0]?.id).toBe(hidden.id)

    const today = tasks.getTodayDashboard(db, now)
    expect(today.recentMatters.map((item) => item.id)).not.toContain(hidden.id)
    expect(today.waiting.map((item) => item.matterId)).not.toContain(hidden.id)
    expect(today.needsAttention.map((item) => item.matterId)).not.toContain(hidden.id)
    expect(tasks.listWaiting(db, now).followUpDue.map((item) => item.matterId)).not.toContain(hidden.id)

    const search = globalSearch(db, 'Hidden Trash')
    expect(search.hits.some((hit) => hit.matterId === hidden.id)).toBe(false)
    expect(globalSearch(db, 'unique-trash-file').hits.some((hit) => hit.type === 'document')).toBe(false)
    expect(globalSearch(db, 'Unique trash timeline').hits.some((hit) => hit.type === 'event')).toBe(false)
    expect(globalSearch(db, 'Unique trash waiting').hits.some((hit) => hit.type === 'task')).toBe(false)

    const organisationDetail = organisations.getOrganisation(db, organisation.id)
    expect(organisationDetail.activeMatterCount).toBe(1)
    expect(organisationDetail.activeMatters.map((item) => item.id)).toEqual([live.id])
    expect(organisationDetail.previousMatters.map((item) => item.id)).not.toContain(hidden.id)
    expect(organisations.listOrganisations(db).find((item) => item.id === organisation.id)?.activeMatterCount).toBe(1)

    const contactDetail = contacts.getContact(db, contact.id)
    expect(contactDetail.matterCount).toBe(1)
    expect(contactDetail.relatedMatters.map((item) => item.id)).toEqual([live.id])
    expect(contacts.listContacts(db).find((item) => item.id === contact.id)?.matterCount).toBe(1)

    matters.restoreMatterFromTrash(db, hidden.id)
    expect(matters.listMatters(db, { status: 'waiting' }).map((item) => item.id)).toContain(hidden.id)
    expect(tasks.getTodayDashboard(db, now).waiting.map((item) => item.matterId)).toContain(hidden.id)
    expect(globalSearch(db, 'Hidden Trash').hits.some((hit) => hit.id === hidden.id)).toBe(true)
    expect(globalSearch(db, 'unique-trash-file').hits.some((hit) => hit.type === 'document')).toBe(true)
    expect(globalSearch(db, 'Unique trash timeline').hits.some((hit) => hit.type === 'event')).toBe(true)
    expect(organisations.getOrganisation(db, organisation.id).activeMatterCount).toBe(2)
    expect(contacts.getContact(db, contact.id).relatedMatters.map((item) => item.id)).toEqual(
      expect.arrayContaining([hidden.id, live.id])
    )
  })
})

describe('Matter Trash filesystem contract', () => {
  it('leaves reference originals and managed copies unchanged through Move and Restore', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'matterdock-trash-files-'))
    tempDirectories.push(userData)
    const sourceDirectory = mkdtempSync(join(tmpdir(), 'matterdock-trash-src-'))
    tempDirectories.push(sourceDirectory)
    const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
    await store.initialize({ seed: false })
    const matter = store.mutate((db) => matters.createMatter(db, { title: 'Files stay put', status: 'in_progress' }))
    const documentsRoot = join(userData, 'documents')
    const documentService = createDocumentService(store, documentsRoot)
    const referencePath = join(sourceDirectory, 'reference.pdf')
    const copySourcePath = join(sourceDirectory, 'managed.pdf')
    writeFileSync(referencePath, 'REFERENCE-ORIGINAL')
    writeFileSync(copySourcePath, 'MANAGED-SOURCE')
    const reference = documentService.addReference({ matterId: matter.id, path: referencePath })
    const copy = documentService.addCopy({ matterId: matter.id, path: copySourcePath })
    const activeCopyDirectory = join(documentsRoot, copy.id)
    const activeCopyFile = copy.managedPath ? join(documentsRoot, copy.managedPath) : activeCopyDirectory

    store.mutate((db) => matters.moveMatterToTrash(db, matter.id))
    expect(existsSync(activeCopyDirectory)).toBe(true)
    expect(readFileSync(referencePath, 'utf8')).toBe('REFERENCE-ORIGINAL')
    expect(readFileSync(copySourcePath, 'utf8')).toBe('MANAGED-SOURCE')
    expect(readFileSync(activeCopyFile, 'utf8')).toBe('MANAGED-SOURCE')
    expect(store.query((db) => documents.findDocument(db, reference.id))).not.toBeNull()
    expect(store.query((db) => documents.findDocument(db, copy.id))).not.toBeNull()

    store.mutate((db) => matters.restoreMatterFromTrash(db, matter.id))
    expect(existsSync(activeCopyDirectory)).toBe(true)
    expect(readFileSync(referencePath, 'utf8')).toBe('REFERENCE-ORIGINAL')
    expect(readFileSync(copySourcePath, 'utf8')).toBe('MANAGED-SOURCE')
    expect(readFileSync(activeCopyFile, 'utf8')).toBe('MANAGED-SOURCE')
  })

  it('rejects permanent deletion of a live Matter and still deletes from Trash', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'matterdock-trash-delete-'))
    tempDirectories.push(userData)
    const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
    await store.initialize({ seed: false })
    const live = store.mutate((db) => matters.createMatter(db, { title: 'Still live' }))
    const trashed = store.mutate((db) => {
      const matter = matters.createMatter(db, { title: 'Ready for delete' })
      return matters.moveMatterToTrash(db, matter.id)
    })
    const documentsRoot = join(userData, 'documents')
    const deletion = createMatterDeletionService(store, documentsRoot)

    expect(() => deletion.deletePermanently(live.id)).toThrow(USER_ERRORS.matterDeleteRequiresTrash)
    try {
      deletion.deletePermanently(live.id)
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('MATTER_DELETE_REQUIRES_TRASH')
    }
    expect(matters.getMatter(store.query((db) => db), live.id).id).toBe(live.id)

    expect(deletion.deletePermanently(trashed.id)).toEqual({ id: trashed.id })
    expect(() => matters.getMatter(store.query((db) => db), trashed.id)).toThrow(USER_ERRORS.matterNotFound)
  })
})
