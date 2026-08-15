import { PRIORITY_LABELS, STATUS_LABELS, type ContextFormat } from '@shared/types'
import { formatHumanDate } from './dates'
import type { MatterContextSnapshot } from './types'

function statusLabel(value: string): string {
  return STATUS_LABELS[value as keyof typeof STATUS_LABELS] ?? value
}

function priorityLabel(value: string): string {
  return PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS] ?? value
}

function eventHeading(event: MatterContextSnapshot['timeline'][number]): string {
  const type = event.type[0]?.toUpperCase() + event.type.slice(1)
  const direction = event.direction ? ` · ${event.direction[0]?.toUpperCase()}${event.direction.slice(1)}` : ''
  return `${formatHumanDate(event.occurredAt)} — ${type}${direction}`
}

export function renderMarkdown(snapshot: MatterContextSnapshot, include: { next?: boolean; actions?: boolean; waiting?: boolean; closed?: boolean; timeline?: boolean; documents?: boolean; organisation?: boolean; contacts?: boolean; overview?: boolean }): string {
  const lines: string[] = [`# ${snapshot.matter.title}`, '']
  if (include.overview !== false) {
    lines.push('## Matter', '')
    lines.push(`Status: ${statusLabel(snapshot.matter.status)}`)
    lines.push(`Priority: ${priorityLabel(snapshot.matter.priority)}`)
    if (snapshot.matter.reference) lines.push(`Reference: ${snapshot.matter.reference}`)
    if (snapshot.matter.organisationName) lines.push(`Organisation: ${snapshot.matter.organisationName}`)
    if (snapshot.matter.tags.length) lines.push(`Tags: ${snapshot.matter.tags.join(', ')}`)
    lines.push(`Created: ${formatHumanDate(snapshot.matter.createdAt)}`)
    lines.push(`Updated: ${formatHumanDate(snapshot.matter.updatedAt)}`)
    if (snapshot.matter.description) {
      lines.push('', snapshot.matter.description)
    }
    lines.push('')
  }
  if (include.organisation && snapshot.organisation) {
    lines.push('## Organisation', '', snapshot.organisation.name)
    if (snapshot.organisation.aliases.length) lines.push(`Aliases: ${snapshot.organisation.aliases.join(', ')}`)
    if (snapshot.organisation.notes) lines.push('', snapshot.organisation.notes)
    lines.push('')
  }
  if (include.contacts && snapshot.contacts.length) {
    lines.push('## Contacts', '')
    for (const contact of snapshot.contacts) {
      lines.push(`### ${contact.name}`)
      if (contact.role) lines.push(`Role: ${contact.role}`)
      if (contact.organisationName) lines.push(`Organisation: ${contact.organisationName}`)
      if (contact.jobTitle) lines.push(`Job title: ${contact.jobTitle}`)
      if (contact.email) lines.push(`Email: ${contact.email}`)
      if (contact.phone) lines.push(`Phone: ${contact.phone}`)
      if (contact.notes) lines.push(contact.notes)
      lines.push('')
    }
  }
  if (include.next) {
    lines.push('## Next Action', '')
    if (!snapshot.nextAction) lines.push('No Next Action set.', '')
    else {
      lines.push(`Type: ${snapshot.nextAction.type === 'waiting' ? 'Waiting' : 'Action'}`)
      lines.push(snapshot.nextAction.title)
      if (snapshot.nextAction.waitingFor) lines.push(`Waiting for: ${snapshot.nextAction.waitingFor}`)
      if (snapshot.nextAction.dueAt) lines.push(`Follow-up: ${formatHumanDate(snapshot.nextAction.dueAt)}`)
      if (snapshot.nextAction.notes) lines.push(snapshot.nextAction.notes)
      lines.push('')
    }
  }
  if (include.actions && snapshot.actions.length) {
    lines.push('## Open Actions', '')
    for (const item of snapshot.actions) {
      lines.push(`- ${item.title}${item.dueAt ? ` (Due ${formatHumanDate(item.dueAt)})` : ''}`)
      if (item.notes) lines.push(`  ${item.notes}`)
    }
    lines.push('')
  }
  if (include.waiting && snapshot.waiting.length) {
    lines.push('## Waiting', '')
    for (const item of snapshot.waiting) {
      lines.push(`- ${item.title}${item.waitingFor ? ` — Waiting for ${item.waitingFor}` : ''}`)
      if (item.dueAt) lines.push(`  Follow up ${formatHumanDate(item.dueAt)}`)
      if (item.notes) lines.push(`  ${item.notes}`)
    }
    lines.push('')
  }
  if (include.closed && snapshot.closedWork.length) {
    lines.push('## Completed / cancelled', '')
    for (const item of snapshot.closedWork) {
      lines.push(`- ${item.title} (${item.status})`)
    }
    lines.push('')
  }
  if (include.timeline && snapshot.timeline.length) {
    lines.push('## Timeline', '')
    for (const event of snapshot.timeline) {
      lines.push(`### ${eventHeading(event)}`, '')
      if (event.subject) lines.push(`Subject: ${event.subject}`)
      if (event.contactName) lines.push(`Contact: ${event.contactName}`)
      if (event.title && event.title !== event.subject) lines.push(event.title)
      if (event.body) lines.push('', event.body)
      lines.push('')
    }
  }
  if (include.documents && snapshot.documents.length) {
    lines.push('## Documents', '')
    for (const doc of snapshot.documents) {
      lines.push(`- ${doc.displayName}`)
      lines.push(`  - ${doc.storageMode}`)
      lines.push(`  - ${doc.availability}`)
      if (doc.path) lines.push(`  - ${doc.path}`)
      if (doc.notes) lines.push(`  - ${doc.notes}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim() + '\n'
}

export function renderPlainText(snapshot: MatterContextSnapshot, include: Parameters<typeof renderMarkdown>[1]): string {
  return renderMarkdown(snapshot, include)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
}

export function renderJson(snapshot: MatterContextSnapshot, include: Parameters<typeof renderMarkdown>[1]): string {
  const payload = {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    matter: include.overview !== false ? snapshot.matter : undefined,
    organisation: include.organisation ? snapshot.organisation : undefined,
    contacts: include.contacts ? snapshot.contacts : undefined,
    nextAction: include.next ? snapshot.nextAction : undefined,
    actions: include.actions ? snapshot.actions : undefined,
    waiting: include.waiting ? snapshot.waiting : undefined,
    closedWork: include.closed ? snapshot.closedWork : undefined,
    timeline: include.timeline ? snapshot.timeline : undefined,
    documents: include.documents
      ? snapshot.documents.map((doc) => ({
          ...doc,
          path: doc.path
        }))
      : undefined
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function renderContext(snapshot: MatterContextSnapshot, format: ContextFormat, include: Parameters<typeof renderMarkdown>[1]): string {
  if (format === 'json') return renderJson(snapshot, include)
  if (format === 'text') return renderPlainText(snapshot, include)
  return renderMarkdown(snapshot, include)
}
