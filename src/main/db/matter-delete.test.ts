import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import * as contacts from './contacts'
import * as documents from './documents'
import * as events from './events'
import { migrate } from './migrate'
import * as matters from './matters'
import * as organisations from './organisations'
import * as tasks from './tasks'

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

describe('permanent Matter deletion database primitive', () => {
  it('cascades Matter-owned rows while preserving shared and unrelated records', async () => {
    const db = await memoryDb()
    const organisation = organisations.createOrganisation(db, { name: 'Shared Organisation' })
    const contact = contacts.createContact(db, { name: 'Shared Contact', organisationId: organisation.id })
    const matterA = matters.createMatter(db, {
      title: 'Matter A',
      organisationId: organisation.id,
      status: 'archived',
      tagNames: ['Shared Tag', 'Only A']
    })
    const matterB = matters.createMatter(db, {
      title: 'Matter B',
      organisationId: organisation.id,
      tagNames: ['Shared Tag', 'Only B']
    })

    matters.linkMatterContact(db, { matterId: matterA.id, contactId: contact.id, role: 'Owner' })
    matters.linkMatterContact(db, { matterId: matterB.id, contactId: contact.id, role: 'Reviewer' })

    const eventA = events.createEvent(db, {
      matterId: matterA.id,
      type: 'email',
      direction: 'incoming',
      body: 'A email body',
      email: {
        subject: 'A subject',
        fromAddress: 'a@example.com',
        toAddresses: 'team@example.com',
        ccAddresses: null
      }
    })
    const eventB = events.createEvent(db, {
      matterId: matterB.id,
      type: 'email',
      direction: 'outgoing',
      body: 'B email body',
      email: {
        subject: 'B subject',
        fromAddress: 'team@example.com',
        toAddresses: 'b@example.com',
        ccAddresses: null
      }
    })

    const actionA = tasks.createAction(db, { matterId: matterA.id, title: 'A action', setAsNextAction: true })
    const waitingA = tasks.createWaiting(db, {
      matterId: matterA.id,
      title: 'A waiting',
      waitingForText: 'A person'
    })
    const actionB = tasks.createAction(db, { matterId: matterB.id, title: 'B action', setAsNextAction: true })
    const waitingB = tasks.createWaiting(db, {
      matterId: matterB.id,
      title: 'B waiting',
      waitingForText: 'B person'
    })

    const documentA = documents.insertDocument(db, {
      matterId: matterA.id,
      displayName: 'a.pdf',
      storageMode: 'reference',
      originalPath: 'C:/original/a.pdf',
      managedPath: null,
      fileExtension: 'pdf',
      mimeType: 'application/pdf',
      fileSize: 10
    })
    const documentB = documents.insertDocument(db, {
      matterId: matterB.id,
      displayName: 'b.pdf',
      storageMode: 'reference',
      originalPath: 'C:/original/b.pdf',
      managedPath: null,
      fileExtension: 'pdf',
      mimeType: 'application/pdf',
      fileSize: 20
    })

    matters.deleteMatterRecord(db, matterA.id)

    expect(() => matters.getMatter(db, matterA.id)).toThrow(USER_ERRORS.matterNotFound)
    expect(matters.getMatter(db, matterB.id).title).toBe('Matter B')
    expect(count(db, 'matter_contacts', 'matter_id', matterA.id)).toBe(0)
    expect(count(db, 'matter_contacts', 'matter_id', matterB.id)).toBe(1)
    expect(count(db, 'matter_tags', 'matter_id', matterA.id)).toBe(0)
    expect(count(db, 'matter_tags', 'matter_id', matterB.id)).toBe(2)
    expect(count(db, 'events', 'matter_id', matterA.id)).toBe(0)
    expect(count(db, 'events', 'matter_id', matterB.id)).toBe(1)
    expect(count(db, 'event_email_details', 'event_id', eventA.id)).toBe(0)
    expect(count(db, 'event_email_details', 'event_id', eventB.id)).toBe(1)
    expect(count(db, 'tasks', 'matter_id', matterA.id)).toBe(0)
    expect(count(db, 'tasks', 'matter_id', matterB.id)).toBe(2)
    expect(count(db, 'documents', 'matter_id', matterA.id)).toBe(0)
    expect(count(db, 'documents', 'matter_id', matterB.id)).toBe(1)

    expect(organisations.getOrganisation(db, organisation.id).id).toBe(organisation.id)
    expect(contacts.getContact(db, contact.id).id).toBe(contact.id)
    expect(db.exec("SELECT COUNT(*) FROM tags")[0].values[0][0]).toBe(3)
    expect(() => tasks.getTask(db, actionA.id)).toThrow(USER_ERRORS.taskNotFound)
    expect(() => tasks.getTask(db, waitingA.id)).toThrow(USER_ERRORS.taskNotFound)
    expect(tasks.getTask(db, actionB.id).title).toBe('B action')
    expect(tasks.getTask(db, waitingB.id).title).toBe('B waiting')
    expect(documents.findDocument(db, documentA.id)).toBeNull()
    expect(documents.getDocument(db, documentB.id).id).toBe(documentB.id)
  })

  it('raises the existing Matter-not-found error instead of silently succeeding', async () => {
    const db = await memoryDb()
    const missingId = '550e8400-e29b-41d4-a716-446655440000'

    expect(() => matters.deleteMatterRecord(db, missingId)).toThrow(USER_ERRORS.matterNotFound)
    try {
      matters.deleteMatterRecord(db, missingId)
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('MATTER_NOT_FOUND')
    }
  })
})
