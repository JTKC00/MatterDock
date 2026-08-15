export type ContextContact = {
  name: string
  role: string | null
  organisationName: string | null
  jobTitle: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

export type ContextWorkItem = {
  type: 'action' | 'waiting'
  title: string
  status: string
  priority: string
  dueAt: string | null
  waitingFor: string | null
  waitingSince: string | null
  notes: string | null
  isNextAction: boolean
}

export type ContextEvent = {
  occurredAt: string
  type: string
  direction: string | null
  title: string | null
  contactName: string | null
  subject: string | null
  body: string | null
}

export type ContextDocument = {
  displayName: string
  storageMode: string
  notes: string | null
  availability: string
  extension: string | null
  size: number | null
  path: string | null
}

export type PrivacyOrganisation = {
  name: string
  aliases: string[]
}

export type MatterContextSnapshot = {
  generatedAt: string
  matter: {
    title: string
    reference: string | null
    status: string
    priority: string
    description: string | null
    tags: string[]
    organisationName: string | null
    createdAt: string
    updatedAt: string
  }
  organisation: {
    name: string
    aliases: string[]
    notes: string | null
  } | null
  contacts: ContextContact[]
  nextAction: ContextWorkItem | null
  actions: ContextWorkItem[]
  waiting: ContextWorkItem[]
  closedWork: ContextWorkItem[]
  timeline: ContextEvent[]
  documents: ContextDocument[]
  privacySources?: {
    organisations: PrivacyOrganisation[]
  }
}
