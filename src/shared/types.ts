export const MATTER_STATUSES = [
  'new',
  'in_progress',
  'waiting',
  'scheduled',
  'completed',
  'archived'
] as const

export type MatterStatus = (typeof MATTER_STATUSES)[number]

export const MATTER_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export type MatterPriority = (typeof MATTER_PRIORITIES)[number]

export const STATUS_LABELS: Record<MatterStatus, string> = {
  new: 'New',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  scheduled: 'Scheduled',
  completed: 'Completed',
  archived: 'Archived'
}

export const PRIORITY_LABELS: Record<MatterPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent'
}

export const ACTIVE_MATTER_STATUSES: MatterStatus[] = [
  'new',
  'in_progress',
  'waiting',
  'scheduled'
]

export type MatterSort = 'updated' | 'created' | 'title' | 'priority'

export type Organisation = {
  id: string
  name: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type OrganisationAlias = {
  id: string
  organisationId: string
  alias: string
  normalizedAlias: string
  createdAt: string
}

export type OrganisationSummary = Organisation & {
  aliases: OrganisationAlias[]
  activeMatterCount: number
}

export type OrganisationDetail = OrganisationSummary & {
  contacts: Contact[]
  activeMatters: MatterListItem[]
  previousMatters: MatterListItem[]
}

export type Contact = {
  id: string
  organisationId: string | null
  name: string
  jobTitle: string | null
  phone: string | null
  email: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ContactSummary = Contact & {
  organisationName: string | null
  matterCount: number
}

export type RelatedMatter = MatterListItem & {
  role: string | null
}

export type ContactDetail = ContactSummary & {
  relatedMatters: RelatedMatter[]
}

export type Tag = {
  id: string
  name: string
}

export type MatterContact = {
  contactId: string
  name: string
  role: string | null
  organisationName: string | null
}

export type Matter = {
  id: string
  title: string
  organisationId: string | null
  reference: string | null
  status: MatterStatus
  priority: MatterPriority
  description: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  archivedAt: string | null
}

export type MatterListItem = Matter & {
  organisationName: string | null
  tags: Tag[]
}

export type MatterDetail = MatterListItem & {
  contacts: MatterContact[]
}

export type MatterListQuery = {
  search?: string
  status?: MatterStatus | 'all' | 'active'
  tagId?: string
  sort?: MatterSort
}

export type CreateMatterInput = {
  title: string
  organisationId?: string | null
  organisationName?: string | null
  reference?: string | null
  status?: MatterStatus
  tagNames?: string[]
}

export type UpdateMatterInput = {
  title?: string
  organisationId?: string | null
  reference?: string | null
  status?: MatterStatus
  priority?: MatterPriority
  description?: string | null
}

export type CreateOrganisationInput = {
  name: string
  notes?: string | null
}

export type UpdateOrganisationInput = {
  name?: string
  notes?: string | null
}

export type CreateContactInput = {
  name: string
  organisationId?: string | null
  jobTitle?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}

export type UpdateContactInput = {
  name?: string
  organisationId?: string | null
  jobTitle?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}

export type LinkMatterContactInput = {
  matterId: string
  contactId: string
  role?: string | null
}

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; error: string }
export type IpcResult<T> = IpcOk<T> | IpcErr
