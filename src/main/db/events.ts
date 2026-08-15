import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import { createEventSchema, formatZodError, updateEventSchema } from '@shared/schemas'
import type {
  CreateEventInput,
  EventDirection,
  EventEmailDetails,
  EventType,
  TimelineEvent,
  UpdateEventInput
} from '@shared/types'
import { ZodError } from 'zod/v3'
import { createId, nowIso } from './ids'
import { all, get } from './sql'

type EventRow = {
  id: string
  matter_id: string
  type: EventType
  title: string | null
  body: string | null
  contact_id: string | null
  direction: EventDirection | null
  occurred_at: string
  created_at: string
  updated_at: string
  contact_name: string | null
  contact_organisation: string | null
  from_address: string | null
  to_addresses: string | null
  cc_addresses: string | null
  subject: string | null
}

export function listEventsForMatter(db: Database, matterId: string): TimelineEvent[] {
  return all<EventRow>(
    db,
    `SELECT e.id, e.matter_id, e.type, e.title, e.body, e.contact_id, e.direction,
            e.occurred_at, e.created_at, e.updated_at,
            c.name AS contact_name, o.name AS contact_organisation,
            d.from_address, d.to_addresses, d.cc_addresses, d.subject
     FROM events e
     LEFT JOIN contacts c ON c.id = e.contact_id
     LEFT JOIN organisations o ON o.id = c.organisation_id
     LEFT JOIN event_email_details d ON d.event_id = e.id
     WHERE e.matter_id = ?
     ORDER BY e.occurred_at DESC, e.created_at DESC`,
    [matterId]
  ).map(mapEvent)
}

export function getEvent(db: Database, id: string): TimelineEvent {
  const row = get<EventRow>(
    db,
    `SELECT e.id, e.matter_id, e.type, e.title, e.body, e.contact_id, e.direction,
            e.occurred_at, e.created_at, e.updated_at,
            c.name AS contact_name, o.name AS contact_organisation,
            d.from_address, d.to_addresses, d.cc_addresses, d.subject
     FROM events e
     LEFT JOIN contacts c ON c.id = e.contact_id
     LEFT JOIN organisations o ON o.id = c.organisation_id
     LEFT JOIN event_email_details d ON d.event_id = e.id
     WHERE e.id = ?`,
    [id]
  )
  if (!row) throw new AppError(USER_ERRORS.eventNotFound, 'EVENT_NOT_FOUND')
  return mapEvent(row)
}

export function createEvent(db: Database, input: CreateEventInput): TimelineEvent {
  try {
    const parsed = createEventSchema.parse(input)
    assertMatter(db, parsed.matterId)
    assertContact(db, parsed.contactId)
    const now = nowIso()
    const direction = defaultDirection(parsed.type, parsed.direction)
    const id = createId()
    db.run(
      `INSERT INTO events (
         id, matter_id, type, title, body, contact_id, direction, occurred_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        parsed.matterId,
        parsed.type,
        parsed.title ?? null,
        parsed.body ?? null,
        parsed.contactId ?? null,
        direction,
        parsed.occurredAt ?? now,
        now,
        now
      ]
    )
    if (parsed.type === 'email') {
      upsertEmailDetails(db, id, normalizeEmail(parsed.email))
    }
    touchMatter(db, parsed.matterId, now)
    return getEvent(db, id)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function updateEvent(db: Database, id: string, input: UpdateEventInput): TimelineEvent {
  const existing = getEvent(db, id)
  try {
    const parsed = updateEventSchema.parse(input)
    const merged: CreateEventInput = {
      matterId: existing.matterId,
      type: existing.type,
      title: parsed.title === undefined ? existing.title : parsed.title,
      body: parsed.body === undefined ? existing.body : parsed.body,
      contactId: parsed.contactId === undefined ? existing.contactId : parsed.contactId,
      direction: parsed.direction === undefined ? existing.direction : parsed.direction,
      occurredAt: parsed.occurredAt ?? existing.occurredAt,
      email: parsed.email === undefined ? existing.email : normalizeEmail(parsed.email)
    }
    createEventSchema.parse(merged)
    assertContact(db, merged.contactId)
    const now = nowIso()
    db.run(
      `UPDATE events
       SET title = ?, body = ?, contact_id = ?, direction = ?, occurred_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        merged.title ?? null,
        merged.body ?? null,
        merged.contactId ?? null,
        defaultDirection(existing.type, merged.direction),
        merged.occurredAt ?? existing.occurredAt,
        now,
        id
      ]
    )
    if (existing.type === 'email') {
      upsertEmailDetails(db, id, merged.email ?? null)
    }
    touchMatter(db, existing.matterId, now)
    return getEvent(db, id)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function deleteEvent(db: Database, id: string): { id: string } {
  const existing = getEvent(db, id)
  db.run('DELETE FROM events WHERE id = ?', [id])
  touchMatter(db, existing.matterId, nowIso())
  return { id }
}

function normalizeEmail(
  email: { fromAddress?: string | null; toAddresses?: string | null; ccAddresses?: string | null; subject?: string | null } | null | undefined
): EventEmailDetails | null {
  if (!email) return null
  return {
    fromAddress: email.fromAddress ?? null,
    toAddresses: email.toAddresses ?? null,
    ccAddresses: email.ccAddresses ?? null,
    subject: email.subject ?? null
  }
}

function upsertEmailDetails(db: Database, eventId: string, email: EventEmailDetails | null): void {
  db.run('DELETE FROM event_email_details WHERE event_id = ?', [eventId])
  if (!email) return
  db.run(
    `INSERT INTO event_email_details (event_id, from_address, to_addresses, cc_addresses, subject)
     VALUES (?, ?, ?, ?, ?)`,
    [
      eventId,
      email.fromAddress ?? null,
      email.toAddresses ?? null,
      email.ccAddresses ?? null,
      email.subject ?? null
    ]
  )
}

function touchMatter(db: Database, matterId: string, at: string): void {
  db.run('UPDATE matters SET updated_at = ? WHERE id = ?', [at, matterId])
}

function assertMatter(db: Database, matterId: string): void {
  const found = get(db, 'SELECT id FROM matters WHERE id = ?', [matterId])
  if (!found) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
}

function assertContact(db: Database, contactId: string | null | undefined): void {
  if (!contactId) return
  const found = get(db, 'SELECT id FROM contacts WHERE id = ?', [contactId])
  if (!found) throw new AppError(USER_ERRORS.contactNotFound, 'CONTACT_NOT_FOUND')
}

function defaultDirection(type: EventType, direction: EventDirection | null | undefined): EventDirection | null {
  if (type === 'note' || type === 'meeting') return 'internal'
  return direction ?? null
}

function mapEvent(row: EventRow): TimelineEvent {
  return {
    id: row.id,
    matterId: row.matter_id,
    type: row.type,
    title: row.title,
    body: row.body,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactOrganisation: row.contact_organisation,
    direction: row.direction,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    email:
      row.type === 'email'
        ? {
            fromAddress: row.from_address,
            toAddresses: row.to_addresses,
            ccAddresses: row.cc_addresses,
            subject: row.subject
          }
        : null
  }
}
