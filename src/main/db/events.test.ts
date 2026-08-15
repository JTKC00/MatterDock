import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from './migrate'
import * as contacts from './contacts'
import * as events from './events'
import * as matters from './matters'
import * as organisations from './organisations'
import { get } from './sql'

async function memoryDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

describe('timeline events', () => {
  it('creates every event type and lists newest first', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const other = matters.createMatter(db, { title: 'Other matter' })

    const note = events.createEvent(db, {
      matterId: matter.id,
      type: 'note',
      body: 'Prepared salary supporting documents.',
      occurredAt: '2026-08-14T08:40:00.000Z'
    })
    events.createEvent(db, {
      matterId: matter.id,
      type: 'phone',
      direction: 'outgoing',
      body: 'Confirmed documents can be submitted by email.',
      occurredAt: '2026-08-15T02:32:00.000Z'
    })
    events.createEvent(db, {
      matterId: matter.id,
      type: 'email',
      direction: 'incoming',
      body: 'Please provide the employee records.',
      occurredAt: '2026-08-15T01:10:00.000Z',
      email: { subject: 'Request for additional documents', fromAddress: 'ms.chan@example.com', toAddresses: null, ccAddresses: null }
    })
    events.createEvent(db, {
      matterId: matter.id,
      type: 'whatsapp',
      direction: 'incoming',
      body: 'Sent Benefit Payment letter images.',
      occurredAt: '2026-08-14T03:15:00.000Z'
    })
    events.createEvent(db, {
      matterId: matter.id,
      type: 'meeting',
      title: 'Meeting with Lands Department',
      body: 'Discussed next submission.',
      occurredAt: '2026-08-13T06:00:00.000Z'
    })
    events.createEvent(db, {
      matterId: matter.id,
      type: 'letter',
      direction: 'outgoing',
      title: 'Formal reply',
      body: 'Posted supporting pack.',
      occurredAt: '2026-08-12T04:00:00.000Z'
    })
    events.createEvent(db, {
      matterId: other.id,
      type: 'note',
      body: 'Should not appear on the first matter.',
      occurredAt: '2026-08-16T00:00:00.000Z'
    })

    const list = events.listEventsForMatter(db, matter.id)
    expect(list).toHaveLength(6)
    expect(list.map((item) => item.type)).toEqual(['phone', 'email', 'note', 'whatsapp', 'meeting', 'letter'])
    expect(events.listEventsForMatter(db, other.id).map((item) => item.id)).not.toContain(note.id)
    expect(list[0].direction).toBe('outgoing')
    expect(list[1].email?.subject).toBe('Request for additional documents')
  })

  it('rejects empty or invalid occurredAt and does not invent now', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    expect(() =>
      events.createEvent(db, {
        matterId: matter.id,
        type: 'note',
        body: 'Should not save.',
        occurredAt: ''
      })
    ).toThrow(/date and time/i)
    expect(() =>
      events.createEvent(db, {
        matterId: matter.id,
        type: 'note',
        body: 'Should not save.',
        occurredAt: 'not-a-date'
      })
    ).toThrow(/valid date/i)
    expect(events.listEventsForMatter(db, matter.id)).toHaveLength(0)
  })

  it('preserves multiline event bodies', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const body = 'Called Ms Chan.\n\nDocuments required:\n- Salary record\n- MPF statement'
    const note = events.createEvent(db, { matterId: matter.id, type: 'note', body })
    expect(events.getEvent(db, note.id).body).toBe(body)
  })

  it('links a contact, keeps the event if the contact is later deleted, and updates matter time', async () => {
    const db = await memoryDb()
    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    const contact = contacts.createContact(db, { name: 'Ms Chan', organisationId: org.id })
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application', organisationId: org.id })
    const before = matter.updatedAt

    const created = events.createEvent(db, {
      matterId: matter.id,
      type: 'phone',
      direction: 'outgoing',
      contactId: contact.id,
      body: 'Spoke with Ms Chan.'
    })
    expect(created.contactName).toBe('Ms Chan')
    expect(created.contactOrganisation).toBe('eMPF Platform Company Limited')
    expect(matters.getMatter(db, matter.id).updatedAt >= before).toBe(true)

    contacts.removeContact(db, contact.id)
    const afterDelete = events.getEvent(db, created.id)
    expect(afterDelete.contactId).toBeNull()
    expect(afterDelete.body).toBe('Spoke with Ms Chan.')

    const edited = events.updateEvent(db, created.id, { body: 'Updated call note.' })
    expect(edited.body).toBe('Updated call note.')
    expect(edited.updatedAt >= created.updatedAt).toBe(true)

    events.deleteEvent(db, created.id)
    expect(events.listEventsForMatter(db, matter.id)).toHaveLength(0)
    expect(get(db, 'SELECT event_id FROM event_email_details WHERE event_id = ?', [created.id])).toBeUndefined()
  })

  it('validates email subject or body and cascades email details on delete', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'Email matter' })
    expect(() =>
      events.createEvent(db, { matterId: matter.id, type: 'email', direction: 'incoming' })
    ).toThrow(/subject or paste the email body/i)

    const created = events.createEvent(db, {
      matterId: matter.id,
      type: 'email',
      direction: 'outgoing',
      email: {
        subject: 'Subsidy pack',
        fromAddress: 'me@example.com',
        toAddresses: 'ms.chan@example.com',
        ccAddresses: null
      }
    })
    const updated = events.updateEvent(db, created.id, {
      email: {
        subject: 'Subsidy pack — revised',
        fromAddress: 'me@example.com',
        toAddresses: 'ms.chan@example.com',
        ccAddresses: 'hr@example.com'
      }
    })
    expect(updated.email?.subject).toBe('Subsidy pack — revised')
    expect(updated.email?.ccAddresses).toBe('hr@example.com')

    events.deleteEvent(db, created.id)
    expect(get(db, 'SELECT event_id FROM event_email_details WHERE event_id = ?', [created.id])).toBeUndefined()
  })
})
