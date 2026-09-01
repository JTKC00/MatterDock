import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import { normalizeAlias, optionalText } from '@shared/normalize'
import {
  createMatterSchema,
  formatZodError,
  linkMatterContactSchema,
  updateMatterSchema
} from '@shared/schemas'
import type {
  CreateMatterInput,
  LinkMatterContactInput,
  MatterDetail,
  MatterListItem,
  MatterListQuery,
  MatterPriority,
  MatterStatus,
  UpdateMatterInput
} from '@shared/types'
import { ZodError } from 'zod/v3'
import { createId, nowIso } from './ids'
import {
  mapMatterContact,
  mapMatterListItem,
  type MatterRow
} from './mappers'
import { all, get } from './sql'
import { replaceMatterTags, tagsByMatterIds, tagsForMatter } from './tags'

type MatterListRow = MatterRow & { organisation_name: string | null }

const PRIORITY_RANK: Record<MatterPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
}

export function listMatters(db: Database, query: MatterListQuery = {}): MatterListItem[] {
  const search = optionalText(query.search)
  const clauses: string[] = []
  const params: Array<string> = []

  if (!query.status || query.status === 'active') {
    clauses.push(`m.status != 'archived'`)
  } else if (query.status !== 'all') {
    clauses.push('m.status = ?')
    params.push(query.status)
  }

  if (query.tagId) {
    clauses.push(
      'EXISTS (SELECT 1 FROM matter_tags mt WHERE mt.matter_id = m.id AND mt.tag_id = ?)'
    )
    params.push(query.tagId)
  }

  if (search) {
    clauses.push(
      `(
         m.title LIKE ? ESCAPE '\\'
         OR IFNULL(m.reference, '') LIKE ? ESCAPE '\\'
         OR IFNULL(o.name, '') LIKE ? ESCAPE '\\'
         OR EXISTS (
           SELECT 1 FROM organisation_aliases a
           WHERE a.organisation_id = m.organisation_id
             AND (
               a.alias LIKE ? ESCAPE '\\'
               OR a.normalized_alias = ?
               OR a.normalized_alias LIKE ? ESCAPE '\\'
             )
         )
       )`
    )
    const like = `%${escapeLike(search)}%`
    const normalized = normalizeAlias(search)
    params.push(like, like, like, like, normalized, like)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const order = orderSql(query.sort ?? 'updated')

  const rows = all<MatterListRow>(
    db,
    `SELECT m.*, o.name AS organisation_name
     FROM matters m
     LEFT JOIN organisations o ON o.id = m.organisation_id
     ${where}
     ${order}`,
    params
  )

  const tags = tagsByMatterIds(
    db,
    rows.map((row) => row.id)
  )
  return rows.map((row) => mapMatterListItem(row, tags.get(row.id) ?? []))
}

export function getMatter(db: Database, id: string): MatterDetail {
  const row = get<MatterListRow>(
    db,
    `SELECT m.*, o.name AS organisation_name
     FROM matters m
     LEFT JOIN organisations o ON o.id = m.organisation_id
     WHERE m.id = ?`,
    [id]
  )
  if (!row) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')

  const contacts = all<{
    contact_id: string
    name: string
    role: string | null
    organisation_name: string | null
  }>(
    db,
    `SELECT c.id AS contact_id, c.name, mc.role, o.name AS organisation_name
     FROM matter_contacts mc
     INNER JOIN contacts c ON c.id = mc.contact_id
     LEFT JOIN organisations o ON o.id = c.organisation_id
     WHERE mc.matter_id = ?
     ORDER BY c.name COLLATE NOCASE`,
    [id]
  ).map(mapMatterContact)

  return {
    ...mapMatterListItem(row, tagsForMatter(db, id)),
    contacts
  }
}

export function createMatter(db: Database, input: CreateMatterInput): MatterDetail {
  try {
    const parsed = createMatterSchema.parse(input)
    const organisationId = resolveOrganisationId(db, parsed.organisationId, parsed.organisationName)
    const now = nowIso()
    const status: MatterStatus = parsed.status ?? 'new'
    const id = createId()
    db.run(
      `INSERT INTO matters (
         id, title, organisation_id, reference, status, priority, description,
         created_at, updated_at, completed_at, archived_at
       ) VALUES (?, ?, ?, ?, ?, 'normal', NULL, ?, ?, ?, NULL)`,
      [
        id,
        parsed.title,
        organisationId,
        emptyToNull(parsed.reference),
        status,
        now,
        now,
        status === 'completed' ? now : null
      ]
    )
    if (parsed.tagNames && parsed.tagNames.length > 0) {
      replaceMatterTags(db, id, parsed.tagNames)
    }
    return getMatter(db, id)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function updateMatter(db: Database, id: string, input: UpdateMatterInput): MatterDetail {
  const existing = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [id])
  if (!existing) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
  try {
    const parsed = updateMatterSchema.parse(input)
    if (parsed.organisationId) assertOrganisation(db, parsed.organisationId)
    const nextStatus = parsed.status ?? existing.status
    const now = nowIso()
    const enteringArchive = existing.status !== 'archived' && nextStatus === 'archived'
    const leavingArchive = existing.status === 'archived' && nextStatus !== 'archived'
    const completedAt =
      nextStatus === 'completed'
        ? (existing.completed_at ?? now)
        : nextStatus === 'archived'
          ? existing.completed_at
          : nextStatus === existing.status
            ? existing.completed_at
            : null
    const archivedAt = enteringArchive
      ? (existing.archived_at ?? now)
      : leavingArchive
        ? null
        : existing.archived_at
    const statusBeforeArchive = enteringArchive
      ? existing.status
      : leavingArchive
        ? null
        : existing.status_before_archive

    db.run(
      `UPDATE matters
       SET title = ?,
           organisation_id = ?,
           reference = ?,
           status = ?,
           priority = ?,
           description = ?,
           updated_at = ?,
           completed_at = ?,
           archived_at = ?,
           status_before_archive = ?
       WHERE id = ?`,
      [
        parsed.title ?? existing.title,
        parsed.organisationId === undefined ? existing.organisation_id : parsed.organisationId,
        parsed.reference === undefined ? existing.reference : emptyToNull(parsed.reference),
        nextStatus,
        parsed.priority ?? existing.priority,
        parsed.description === undefined ? existing.description : parsed.description,
        now,
        completedAt,
        archivedAt,
        statusBeforeArchive,
        id
      ]
    )
    return getMatter(db, id)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function archiveMatter(db: Database, id: string): MatterDetail {
  return updateMatter(db, id, { status: 'archived' })
}

export function restoreMatter(db: Database, id: string): MatterDetail {
  const existing = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [id])
  if (!existing) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
  if (existing.status !== 'archived') return getMatter(db, id)
  return updateMatter(db, id, { status: statusBeforeArchive(existing) })
}

/**
 * Delete one Matter row and let the current foreign-key schema remove its
 * Matter-owned records. Filesystem coordination belongs in a main-process
 * service, not in this repository primitive.
 */
export function deleteMatterRecord(db: Database, id: string): void {
  const existing = get<{ id: string }>(db, 'SELECT id FROM matters WHERE id = ?', [id])
  if (!existing) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
  db.run('DELETE FROM matters WHERE id = ?', [id])
}

const RESTORABLE_STATUSES: Array<Exclude<MatterStatus, 'archived'>> = [
  'new',
  'in_progress',
  'waiting',
  'scheduled',
  'completed'
]

function statusBeforeArchive(row: MatterRow): Exclude<MatterStatus, 'archived'> {
  const previous = row.status_before_archive
  if (previous && RESTORABLE_STATUSES.includes(previous)) return previous
  return 'in_progress'
}

export function setMatterTags(db: Database, id: string, tagNames: string[]): MatterDetail {
  const existing = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [id])
  if (!existing) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
  replaceMatterTags(db, id, tagNames)
  db.run('UPDATE matters SET updated_at = ? WHERE id = ?', [nowIso(), id])
  return getMatter(db, id)
}

export function linkMatterContact(db: Database, input: LinkMatterContactInput): MatterDetail {
  try {
    const parsed = linkMatterContactSchema.parse(input)
    const matter = get(db, 'SELECT id FROM matters WHERE id = ?', [parsed.matterId])
    if (!matter) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
    const contact = get(db, 'SELECT id FROM contacts WHERE id = ?', [parsed.contactId])
    if (!contact) throw new AppError(USER_ERRORS.contactNotFound, 'CONTACT_NOT_FOUND')
    const existing = get(
      db,
      'SELECT matter_id FROM matter_contacts WHERE matter_id = ? AND contact_id = ?',
      [parsed.matterId, parsed.contactId]
    )
    if (existing) throw new AppError(USER_ERRORS.linkExists, 'LINK_EXISTS')
    db.run('INSERT INTO matter_contacts (matter_id, contact_id, role) VALUES (?, ?, ?)', [
      parsed.matterId,
      parsed.contactId,
      emptyToNull(parsed.role)
    ])
    db.run('UPDATE matters SET updated_at = ? WHERE id = ?', [nowIso(), parsed.matterId])
    return getMatter(db, parsed.matterId)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function unlinkMatterContact(db: Database, matterId: string, contactId: string): MatterDetail {
  const matter = get(db, 'SELECT id FROM matters WHERE id = ?', [matterId])
  if (!matter) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
  db.run('DELETE FROM matter_contacts WHERE matter_id = ? AND contact_id = ?', [matterId, contactId])
  db.run('UPDATE matters SET updated_at = ? WHERE id = ?', [nowIso(), matterId])
  return getMatter(db, matterId)
}

function resolveOrganisationId(
  db: Database,
  organisationId?: string | null,
  organisationName?: string | null
): string | null {
  if (organisationId) {
    assertOrganisation(db, organisationId)
    return organisationId
  }
  const name = optionalText(organisationName)
  if (!name) return null
  const existing = get<{ id: string }>(
    db,
    'SELECT id FROM organisations WHERE name = ? COLLATE NOCASE',
    [name]
  )
  if (existing) return existing.id
  const now = nowIso()
  const id = createId()
  db.run(
    `INSERT INTO organisations (id, name, notes, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`,
    [id, name, now, now]
  )
  return id
}

function assertOrganisation(db: Database, organisationId: string): void {
  const found = get(db, 'SELECT id FROM organisations WHERE id = ?', [organisationId])
  if (!found) throw new AppError(USER_ERRORS.organisationNotFound, 'ORG_NOT_FOUND')
}

function orderSql(sort: NonNullable<MatterListQuery['sort']>): string {
  switch (sort) {
    case 'created':
      return 'ORDER BY m.created_at DESC'
    case 'title':
      return 'ORDER BY m.title COLLATE NOCASE'
    case 'priority':
      return `ORDER BY CASE m.priority
        WHEN 'urgent' THEN ${PRIORITY_RANK.urgent}
        WHEN 'high' THEN ${PRIORITY_RANK.high}
        WHEN 'normal' THEN ${PRIORITY_RANK.normal}
        ELSE ${PRIORITY_RANK.low}
      END, m.updated_at DESC`
    default:
      return 'ORDER BY m.updated_at DESC'
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  return value.length === 0 ? null : value
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}
