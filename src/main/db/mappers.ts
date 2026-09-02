import type {
  Contact,
  Matter,
  MatterContact,
  MatterListItem,
  MatterPriority,
  MatterStatus,
  Organisation,
  OrganisationAlias,
  Tag
} from '@shared/types'

export type OrganisationRow = {
  id: string
  name: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type AliasRow = {
  id: string
  organisation_id: string
  alias: string
  normalized_alias: string
  created_at: string
}

export type ContactRow = {
  id: string
  organisation_id: string | null
  name: string
  job_title: string | null
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type MatterRow = {
  id: string
  title: string
  organisation_id: string | null
  reference: string | null
  status: MatterStatus
  priority: MatterPriority
  description: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  archived_at: string | null
  status_before_archive: Exclude<MatterStatus, 'archived'> | null
  trashed_at: string | null
}

export type TagRow = {
  id: string
  name: string
}

export function mapOrganisation(row: OrganisationRow): Organisation {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function mapAlias(row: AliasRow): OrganisationAlias {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    alias: row.alias,
    normalizedAlias: row.normalized_alias,
    createdAt: row.created_at
  }
}

export function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    jobTitle: row.job_title,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function mapMatter(row: MatterRow): Matter {
  return {
    id: row.id,
    title: row.title,
    organisationId: row.organisation_id,
    reference: row.reference,
    status: row.status,
    priority: row.priority,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    trashedAt: row.trashed_at ?? null
  }
}

export function mapTag(row: TagRow): Tag {
  return { id: row.id, name: row.name }
}

export function mapMatterListItem(
  row: MatterRow & { organisation_name: string | null },
  tags: Tag[]
): MatterListItem {
  return {
    ...mapMatter(row),
    organisationName: row.organisation_name,
    tags
  }
}

export function mapMatterContact(row: {
  contact_id: string
  name: string
  role: string | null
  organisation_name: string | null
}): MatterContact {
  return {
    contactId: row.contact_id,
    name: row.name,
    role: row.role,
    organisationName: row.organisation_name
  }
}
