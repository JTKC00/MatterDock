import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import { normalizeAlias, optionalText } from '@shared/normalize'
import {
  aliasSchema,
  createOrganisationSchema,
  formatZodError,
  updateOrganisationSchema
} from '@shared/schemas'
import type {
  CreateOrganisationInput,
  Organisation,
  OrganisationAlias,
  OrganisationDetail,
  OrganisationSummary,
  UpdateOrganisationInput
} from '@shared/types'
import { ZodError } from 'zod/v3'
import { createId, nowIso } from './ids'
import {
  mapAlias,
  mapContact,
  mapOrganisation,
  type AliasRow,
  type ContactRow,
  type OrganisationRow
} from './mappers'
import { listMatters } from './matters'
import { all, get } from './sql'

type OrganisationCountRow = OrganisationRow & { active_matter_count: number }

function attachAliases(db: Database, organisations: Organisation[]): OrganisationSummary[] {
  if (organisations.length === 0) return []
  const ids = organisations.map((org) => org.id)
  const placeholders = ids.map(() => '?').join(', ')
  const aliasRows = all<AliasRow>(
    db,
    `SELECT id, organisation_id, alias, normalized_alias, created_at
     FROM organisation_aliases
     WHERE organisation_id IN (${placeholders})
     ORDER BY alias COLLATE NOCASE`,
    ids
  )
  const grouped = new Map<string, OrganisationAlias[]>()
  for (const row of aliasRows) {
    const list = grouped.get(row.organisation_id) ?? []
    list.push(mapAlias(row))
    grouped.set(row.organisation_id, list)
  }
  return organisations.map((org) => ({
    ...org,
    aliases: grouped.get(org.id) ?? [],
    activeMatterCount: 0
  }))
}

export function listOrganisations(db: Database, search?: string): OrganisationSummary[] {
  const query = optionalText(search)
  const rows = query
    ? all<OrganisationCountRow>(
        db,
        `SELECT DISTINCT o.id, o.name, o.notes, o.created_at, o.updated_at,
                (
                  SELECT COUNT(*) FROM matters m
                  WHERE m.organisation_id = o.id
                    AND m.status NOT IN ('completed', 'archived')
                    AND m.trashed_at IS NULL
                ) AS active_matter_count
         FROM organisations o
         LEFT JOIN organisation_aliases a ON a.organisation_id = o.id
         WHERE o.name LIKE ? ESCAPE '\\'
            OR a.alias LIKE ? ESCAPE '\\'
            OR a.normalized_alias = ?
         ORDER BY o.name COLLATE NOCASE`,
        [`%${escapeLike(query)}%`, `%${escapeLike(query)}%`, normalizeAlias(query)]
      )
    : all<OrganisationCountRow>(
        db,
        `SELECT o.id, o.name, o.notes, o.created_at, o.updated_at,
                (
                  SELECT COUNT(*) FROM matters m
                  WHERE m.organisation_id = o.id
                    AND m.status NOT IN ('completed', 'archived')
                    AND m.trashed_at IS NULL
                ) AS active_matter_count
         FROM organisations o
         ORDER BY o.name COLLATE NOCASE`
      )

  const summaries = attachAliases(
    db,
    rows.map((row) => mapOrganisation(row))
  )
  return summaries.map((org, index) => ({
    ...org,
    activeMatterCount: rows[index]?.active_matter_count ?? 0
  }))
}

export function searchOrganisations(db: Database, search: string): OrganisationSummary[] {
  return listOrganisations(db, search)
}

export function getOrganisation(db: Database, id: string): OrganisationDetail {
  const row = get<OrganisationCountRow>(
    db,
    `SELECT o.id, o.name, o.notes, o.created_at, o.updated_at,
            (
              SELECT COUNT(*) FROM matters m
              WHERE m.organisation_id = o.id
                AND m.status NOT IN ('completed', 'archived')
                AND m.trashed_at IS NULL
            ) AS active_matter_count
     FROM organisations o
     WHERE o.id = ?`,
    [id]
  )
  if (!row) throw new AppError(USER_ERRORS.organisationNotFound, 'ORG_NOT_FOUND')

  const aliases = all<AliasRow>(
    db,
    `SELECT id, organisation_id, alias, normalized_alias, created_at
     FROM organisation_aliases
     WHERE organisation_id = ?
     ORDER BY alias COLLATE NOCASE`,
    [id]
  ).map(mapAlias)

  const contacts = all<ContactRow>(
    db,
    `SELECT id, organisation_id, name, job_title, phone, email, notes, created_at, updated_at
     FROM contacts
     WHERE organisation_id = ?
     ORDER BY name COLLATE NOCASE`,
    [id]
  ).map(mapContact)

  const activeMatters = listMatters(db, { status: 'active' }).filter((matter) => matter.organisationId === id)
  const previousMatters = listMatters(db, { status: 'all' }).filter(
    (matter) =>
      matter.organisationId === id && (matter.status === 'completed' || matter.status === 'archived')
  )

  return {
    ...mapOrganisation(row),
    aliases,
    activeMatterCount: row.active_matter_count,
    contacts,
    activeMatters,
    previousMatters
  }
}

export function createOrganisation(db: Database, input: CreateOrganisationInput): Organisation {
  try {
    const parsed = createOrganisationSchema.parse(input)
    const now = nowIso()
    const organisation: Organisation = {
      id: createId(),
      name: parsed.name,
      notes: parsed.notes ?? null,
      createdAt: now,
      updatedAt: now
    }
    db.run(
      `INSERT INTO organisations (id, name, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [organisation.id, organisation.name, organisation.notes, organisation.createdAt, organisation.updatedAt]
    )
    return organisation
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function updateOrganisation(
  db: Database,
  id: string,
  input: UpdateOrganisationInput
): Organisation {
  const existing = get<OrganisationRow>(db, 'SELECT * FROM organisations WHERE id = ?', [id])
  if (!existing) throw new AppError(USER_ERRORS.organisationNotFound, 'ORG_NOT_FOUND')
  try {
    const parsed = updateOrganisationSchema.parse(input)
    const next: Organisation = {
      ...mapOrganisation(existing),
      name: parsed.name ?? existing.name,
      notes: parsed.notes === undefined ? existing.notes : parsed.notes,
      updatedAt: nowIso()
    }
    db.run('UPDATE organisations SET name = ?, notes = ?, updated_at = ? WHERE id = ?', [
      next.name,
      next.notes,
      next.updatedAt,
      id
    ])
    return next
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function removeOrganisation(db: Database, id: string): { id: string } {
  const existing = get<OrganisationRow>(db, 'SELECT * FROM organisations WHERE id = ?', [id])
  if (!existing) throw new AppError(USER_ERRORS.organisationNotFound, 'ORG_NOT_FOUND')
  const linked = get<{ count: number }>(
    db,
    'SELECT COUNT(*) AS count FROM matters WHERE organisation_id = ?',
    [id]
  )
  if ((linked?.count ?? 0) > 0) {
    throw new AppError(USER_ERRORS.organisationInUse, 'ORG_IN_USE')
  }
  db.run('UPDATE contacts SET organisation_id = NULL, updated_at = ? WHERE organisation_id = ?', [
    nowIso(),
    id
  ])
  db.run('DELETE FROM organisations WHERE id = ?', [id])
  return { id }
}

export function addAlias(db: Database, organisationId: string, rawAlias: string): OrganisationAlias {
  const organisation = get<OrganisationRow>(db, 'SELECT * FROM organisations WHERE id = ?', [
    organisationId
  ])
  if (!organisation) throw new AppError(USER_ERRORS.organisationNotFound, 'ORG_NOT_FOUND')

  try {
    const alias = aliasSchema.parse(rawAlias)
    const normalized = normalizeAlias(alias)
    const duplicate = get<AliasRow>(
      db,
      'SELECT * FROM organisation_aliases WHERE organisation_id = ? AND normalized_alias = ?',
      [organisationId, normalized]
    )
    if (duplicate) throw new AppError(USER_ERRORS.aliasDuplicate, 'ALIAS_DUPLICATE')

    const row: OrganisationAlias = {
      id: createId(),
      organisationId,
      alias,
      normalizedAlias: normalized,
      createdAt: nowIso()
    }
    db.run(
      `INSERT INTO organisation_aliases (id, organisation_id, alias, normalized_alias, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [row.id, row.organisationId, row.alias, row.normalizedAlias, row.createdAt]
    )
    db.run('UPDATE organisations SET updated_at = ? WHERE id = ?', [row.createdAt, organisationId])
    return row
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function removeAlias(db: Database, aliasId: string): { id: string } {
  const existing = get<AliasRow>(db, 'SELECT * FROM organisation_aliases WHERE id = ?', [aliasId])
  if (!existing) throw new AppError(USER_ERRORS.aliasNotSaved, 'ALIAS_NOT_FOUND')
  db.run('DELETE FROM organisation_aliases WHERE id = ?', [aliasId])
  return { id: aliasId }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}
