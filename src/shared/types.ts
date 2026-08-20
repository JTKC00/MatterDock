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

export const EVENT_TYPES = ['note', 'phone', 'email', 'whatsapp', 'meeting', 'letter'] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  note: 'Note',
  phone: 'Phone Call',
  email: 'Email',
  whatsapp: 'WhatsApp',
  meeting: 'Meeting',
  letter: 'Letter'
}

export const EVENT_DIRECTIONS = ['incoming', 'outgoing', 'internal'] as const

export type EventDirection = (typeof EVENT_DIRECTIONS)[number]

export type EventEmailDetails = {
  fromAddress: string | null
  toAddresses: string | null
  ccAddresses: string | null
  subject: string | null
}

export type TimelineEvent = {
  id: string
  matterId: string
  type: EventType
  title: string | null
  body: string | null
  contactId: string | null
  contactName: string | null
  contactOrganisation: string | null
  direction: EventDirection | null
  occurredAt: string
  createdAt: string
  updatedAt: string
  email: EventEmailDetails | null
}

export const TASK_TYPES = ['action', 'waiting'] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const TASK_STATUSES = ['open', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export type WorkItem = {
  id: string
  matterId: string
  type: TaskType
  title: string
  notes: string | null
  status: TaskStatus
  dueAt: string | null
  waitingForContactId: string | null
  waitingForText: string | null
  waitingSince: string | null
  isNextAction: boolean
  priority: MatterPriority
  completedAt: string | null
  createdAt: string
  updatedAt: string
  waitingForDisplay: string | null
  matterTitle?: string
  matterStatus?: MatterStatus
  organisationName?: string | null
}

export type CreateActionInput = {
  matterId: string
  title: string
  notes?: string | null
  dueAt?: string | null
  priority?: MatterPriority
  setAsNextAction?: boolean
}

export type CreateWaitingInput = {
  matterId: string
  title: string
  notes?: string | null
  dueAt?: string | null
  priority?: MatterPriority
  waitingForContactId?: string | null
  waitingForText?: string | null
  waitingSince?: string | null
  setAsNextAction?: boolean
}

export type UpdateWorkItemInput = {
  title?: string
  notes?: string | null
  dueAt?: string | null
  priority?: MatterPriority
  waitingForContactId?: string | null
  waitingForText?: string | null
  waitingSince?: string | null
}

export type TodaySummary = {
  overdue: number
  dueToday: number
  waiting: number
}

export type TodayDashboard = {
  summary: TodaySummary
  needsAttention: WorkItem[]
  waiting: WorkItem[]
  recentMatters: MatterListItem[]
}

export type WaitingBoard = {
  followUpDue: WorkItem[]
  upcoming: WorkItem[]
  noFollowUp: WorkItem[]
}

export type CreateEventInput = {
  matterId: string
  type: EventType
  title?: string | null
  body?: string | null
  contactId?: string | null
  direction?: EventDirection | null
  occurredAt?: string
  email?: EventEmailDetails | null
}

export type UpdateEventInput = {
  title?: string | null
  body?: string | null
  contactId?: string | null
  direction?: EventDirection | null
  occurredAt?: string
  email?: EventEmailDetails | null
}

export const DOCUMENT_STORAGE_MODES = ['reference', 'copy'] as const
export type DocumentStorageMode = (typeof DOCUMENT_STORAGE_MODES)[number]

export type MatterDocument = {
  id: string
  matterId: string
  displayName: string
  storageMode: DocumentStorageMode
  originalPath: string | null
  managedPath: string | null
  fileExtension: string | null
  mimeType: string | null
  fileSize: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  available: boolean
  availability: 'ok' | 'missing_reference' | 'missing_copy'
  resolvedPath: string | null
}

export type PickedFile = {
  path: string
  name: string
  size: number
  extension: string
}

export type AttachDocumentInput = {
  matterId: string
  path: string
  notes?: string | null
}

export type UpdateDocumentInput = {
  notes?: string | null
}

export type RelinkDocumentInput = {
  path: string
}

export const SEARCH_HIT_TYPES = ['matter', 'organisation', 'contact', 'event', 'task', 'document'] as const
export type SearchHitType = (typeof SEARCH_HIT_TYPES)[number]

export type SearchHit = {
  id: string
  type: SearchHitType
  label: string
  title: string
  subtitle: string
  snippet: string | null
  href: string
  matterId: string | null
  matterTitle: string | null
  archived: boolean
  score: number
  fileUnavailable?: boolean
  kind?: string
}

export type SearchGroup = {
  key: string
  label: string
  hits: SearchHit[]
}

export type SearchResponse = {
  query: string
  groups: SearchGroup[]
  hits: SearchHit[]
}

export const CONTEXT_PRESETS = ['full', 'current_work', 'timeline', 'privacy_safe'] as const
export type ContextPreset = (typeof CONTEXT_PRESETS)[number]

export const CONTEXT_FORMATS = ['markdown', 'text', 'json'] as const
export type ContextFormat = (typeof CONTEXT_FORMATS)[number]

export const TIMELINE_RANGES = ['all', '30d', '90d'] as const
export type TimelineRange = (typeof TIMELINE_RANGES)[number]

export type ContextOptions = {
  includeOverview: boolean
  includeOrganisation: boolean
  includeContacts: boolean
  contactsMinimal: boolean
  includeNextAction: boolean
  includeOpenActions: boolean
  includeWaiting: boolean
  includeClosedWork: boolean
  includeTimeline: boolean
  timelineRange: TimelineRange
  includeDocuments: boolean
  includeFilePaths: boolean
  redactContactNames: boolean
  redactOrganisationNames: boolean
  redactEmails: boolean
  redactPhones: boolean
  redactReference: boolean
  hideFilePaths: boolean
  customRedactions: string[]
  format: ContextFormat
}

export type ContextExport = {
  format: ContextFormat
  content: string
  generatedAt: string
  characterCount: number
  suggestedName: string
}

export type ContextSaveInput = {
  suggestedName: string
  format: ContextFormat
  content: string
}

export type {
  BackupCreateResult,
  BackupInspectResult,
  BackupRestoreResult,
  BackupSummary,
  DataExportResult
} from './backup'

export type { SupportedLocale } from './i18n'

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; error: string; code?: string }
export type IpcResult<T> = IpcOk<T> | IpcErr
