import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import { optionalText } from '@shared/normalize'
import {
  createContactSchema,
  formatZodError,
  updateContactSchema
} from '@shared/schemas'
import type {
  Contact,
  ContactDetail,
  ContactSummary,
  CreateContactInput,
  RelatedMatter,
  UpdateContactInput
} from '@shared/types'
import { ZodError } from 'zod/v3'
import { createId, nowIso } from './ids'
import { mapContact, mapMatterListItem, type ContactRow, type MatterRow } from './mappers'
import { all, get } from './sql'
import { tagsByMatterIds } from './tags'

type ContactListRow = ContactRow & {
  organisation_name: string | null
  matter_count: number
}

export function listContacts(db: Database, search?: string): ContactSummary[] {
  const query = optionalText(search)
  const like = query ? `%${escapeLike(query)}%` : null
  const rows = like
    ? all<ContactListRow>(
        db,
        `SELECT c.*, o.name AS organisation_name,
                (SELECT COUNT(*) FROM matter_contacts mc INNER JOIN matters m ON m.id = mc.matter_id WHERE mc.contact_id = c.id AND m.trashed_at IS NULL) AS matter_count
         FROM contacts c
         LEFT JOIN organisations o ON o.id = c.organisation_id
         WHERE c.name LIKE ? ESCAPE '\\'
            OR IFNULL(c.email, '') LIKE ? ESCAPE '\\'
            OR IFNULL(c.job_title, '') LIKE ? ESCAPE '\\'
            OR IFNULL(o.name, '') LIKE ? ESCAPE '\\'
         ORDER BY c.name COLLATE NOCASE`,
        [like, like, like, like]
      )
    : all<ContactListRow>(
        db,
        `SELECT c.*, o.name AS organisation_name,
                (SELECT COUNT(*) FROM matter_contacts mc INNER JOIN matters m ON m.id = mc.matter_id WHERE mc.contact_id = c.id AND m.trashed_at IS NULL) AS matter_count
         FROM contacts c
         LEFT JOIN organisations o ON o.id = c.organisation_id
         ORDER BY c.name COLLATE NOCASE`
      )

  return rows.map((row) => ({
    ...mapContact(row),
    organisationName: row.organisation_name,
    matterCount: row.matter_count
  }))
}

export function searchContacts(db: Database, search: string): ContactSummary[] {
  return listContacts(db, search)
}

export function getContact(db: Database, id: string): ContactDetail {
  const row = get<ContactListRow>(
    db,
    `SELECT c.*, o.name AS organisation_name,
            (SELECT COUNT(*) FROM matter_contacts mc INNER JOIN matters m ON m.id = mc.matter_id WHERE mc.contact_id = c.id AND m.trashed_at IS NULL) AS matter_count
     FROM contacts c
     LEFT JOIN organisations o ON o.id = c.organisation_id
     WHERE c.id = ?`,
    [id]
  )
  if (!row) throw new AppError(USER_ERRORS.contactNotFound, 'CONTACT_NOT_FOUND')

  const matterRows = all<
    MatterRow & { organisation_name: string | null; role: string | null }
  >(
    db,
    `SELECT m.*, o.name AS organisation_name, mc.role
     FROM matter_contacts mc
     INNER JOIN matters m ON m.id = mc.matter_id
     LEFT JOIN organisations o ON o.id = m.organisation_id
     WHERE mc.contact_id = ?
       AND m.trashed_at IS NULL
     ORDER BY m.updated_at DESC`,
    [id]
  )
  const tags = tagsByMatterIds(
    db,
    matterRows.map((matter) => matter.id)
  )
  const relatedMatters: RelatedMatter[] = matterRows.map((matter) => ({
    ...mapMatterListItem(matter, tags.get(matter.id) ?? []),
    role: matter.role
  }))

  return {
    ...mapContact(row),
    organisationName: row.organisation_name,
    matterCount: row.matter_count,
    relatedMatters
  }
}

export function createContact(db: Database, input: CreateContactInput): Contact {
  try {
    const parsed = createContactSchema.parse(input)
    assertOrganisation(db, parsed.organisationId)
    const now = nowIso()
    const contact: Contact = {
      id: createId(),
      organisationId: parsed.organisationId ?? null,
      name: parsed.name,
      jobTitle: emptyToNull(parsed.jobTitle),
      phone: emptyToNull(parsed.phone),
      email: parsed.email ?? null,
      notes: parsed.notes ?? null,
      createdAt: now,
      updatedAt: now
    }
    db.run(
      `INSERT INTO contacts (
         id, organisation_id, name, job_title, phone, email, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contact.id,
        contact.organisationId,
        contact.name,
        contact.jobTitle,
        contact.phone,
        contact.email,
        contact.notes,
        contact.createdAt,
        contact.updatedAt
      ]
    )
    return contact
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function updateContact(db: Database, id: string, input: UpdateContactInput): Contact {
  const existing = get<ContactRow>(db, 'SELECT * FROM contacts WHERE id = ?', [id])
  if (!existing) throw new AppError(USER_ERRORS.contactNotFound, 'CONTACT_NOT_FOUND')
  try {
    const parsed = updateContactSchema.parse(input)
    if (parsed.organisationId !== undefined) assertOrganisation(db, parsed.organisationId)
    const next: Contact = {
      ...mapContact(existing),
      name: parsed.name ?? existing.name,
      organisationId:
        parsed.organisationId === undefined ? existing.organisation_id : parsed.organisationId,
      jobTitle: parsed.jobTitle === undefined ? existing.job_title : emptyToNull(parsed.jobTitle),
      phone: parsed.phone === undefined ? existing.phone : emptyToNull(parsed.phone),
      email: parsed.email === undefined ? existing.email : parsed.email,
      notes: parsed.notes === undefined ? existing.notes : parsed.notes,
      updatedAt: nowIso()
    }
    db.run(
      `UPDATE contacts
       SET organisation_id = ?, name = ?, job_title = ?, phone = ?, email = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.organisationId,
        next.name,
        next.jobTitle,
        next.phone,
        next.email,
        next.notes,
        next.updatedAt,
        id
      ]
    )
    return next
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function removeContact(db: Database, id: string): { id: string } {
  const existing = get<ContactRow>(db, 'SELECT * FROM contacts WHERE id = ?', [id])
  if (!existing) throw new AppError(USER_ERRORS.contactNotFound, 'CONTACT_NOT_FOUND')
  const linked = get<{ count: number }>(
    db,
    'SELECT COUNT(*) AS count FROM matter_contacts WHERE contact_id = ?',
    [id]
  )
  if ((linked?.count ?? 0) > 0) {
    throw new AppError(USER_ERRORS.contactInUse, 'CONTACT_IN_USE')
  }
  db.run('DELETE FROM contacts WHERE id = ?', [id])
  return { id }
}

function assertOrganisation(db: Database, organisationId: string | null | undefined): void {
  if (!organisationId) return
  const found = get(db, 'SELECT id FROM organisations WHERE id = ?', [organisationId])
  if (!found) throw new AppError(USER_ERRORS.organisationNotFound, 'ORG_NOT_FOUND')
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  return value.length === 0 ? null : value
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}
