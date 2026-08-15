import type { Database } from 'sql.js'
import { AppError } from '@shared/errors'
import { contextOptionsSchema, formatZodError } from '@shared/schemas'
import type { ContextExport, ContextOptions } from '@shared/types'
import { ZodError } from 'zod/v3'
import { startOfLocalDay } from './dates'
import { loadMatterContextSnapshot } from './load'
import { redactSnapshot } from './redact'
import { renderContext } from './render'
import type { MatterContextSnapshot } from './types'

function applyScope(snapshot: MatterContextSnapshot, options: ContextOptions, now: Date): MatterContextSnapshot {
  const next: MatterContextSnapshot = {
    ...snapshot,
    organisation: options.includeOrganisation ? snapshot.organisation : null,
    contacts: options.includeContacts
      ? options.contactsMinimal
        ? snapshot.contacts.map((contact) => ({
            name: contact.name,
            role: contact.role,
            organisationName: contact.organisationName,
            jobTitle: null,
            email: null,
            phone: null,
            notes: null
          }))
        : snapshot.contacts
      : [],
    nextAction: options.includeNextAction ? snapshot.nextAction : null,
    actions: options.includeOpenActions ? snapshot.actions : [],
    waiting: options.includeWaiting ? snapshot.waiting : [],
    closedWork: options.includeClosedWork ? snapshot.closedWork : [],
    timeline: options.includeTimeline ? filterTimeline(snapshot.timeline, options.timelineRange, now) : [],
    documents: options.includeDocuments ? snapshot.documents : []
  }
  return next
}

function filterTimeline(
  timeline: MatterContextSnapshot['timeline'],
  range: ContextOptions['timelineRange'],
  now: Date
): MatterContextSnapshot['timeline'] {
  if (range === 'all') return timeline
  const days = range === '30d' ? 30 : 90
  const cutoff = startOfLocalDay(now)
  cutoff.setDate(cutoff.getDate() - days)
  return timeline.filter((event) => new Date(event.occurredAt).getTime() >= cutoff.getTime())
}

export function buildMatterContext(
  db: Database,
  matterId: string,
  rawOptions: ContextOptions,
  documentsRoot: string,
  now = new Date()
): ContextExport {
  try {
    const options = contextOptionsSchema.parse(rawOptions)
    const loaded = loadMatterContextSnapshot(db, matterId, documentsRoot, now)
    const scoped = applyScope(loaded, options, now)
    const redacted = redactSnapshot(scoped, options)
    const content = renderContext(redacted, options.format, {
      overview: options.includeOverview,
      organisation: options.includeOrganisation && Boolean(redacted.organisation),
      contacts: options.includeContacts && redacted.contacts.length > 0,
      next: options.includeNextAction,
      actions: options.includeOpenActions && redacted.actions.length > 0,
      waiting: options.includeWaiting && redacted.waiting.length > 0,
      closed: options.includeClosedWork && redacted.closedWork.length > 0,
      timeline: options.includeTimeline && redacted.timeline.length > 0,
      documents: options.includeDocuments && redacted.documents.length > 0
    })
    const ext = options.format === 'json' ? 'json' : options.format === 'text' ? 'txt' : 'md'
    const safe = loaded.matter.title.replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim() || 'matter'
    return {
      format: options.format,
      content,
      generatedAt: loaded.generatedAt,
      characterCount: content.length,
      suggestedName: `${safe}-context.${ext}`
    }
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}
