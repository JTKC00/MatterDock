import type { Database } from 'sql.js'
import { fileExists } from '../documents/files'
import { absoluteManagedPath } from '../documents/files'
import * as documents from '../db/documents'
import * as events from '../db/events'
import * as matters from '../db/matters'
import * as organisations from '../db/organisations'
import { all } from '../db/sql'
import * as tasks from '../db/tasks'
import type { ContextDocument, ContextEvent, ContextWorkItem, MatterContextSnapshot } from './types'

export function loadMatterContextSnapshot(
  db: Database,
  matterId: string,
  documentsRoot: string,
  now = new Date()
): MatterContextSnapshot {
  const matter = matters.getMatter(db, matterId)
  const organisation = matter.organisationId ? organisations.getOrganisation(db, matter.organisationId) : null
  const linked = all<{
    name: string
    role: string | null
    organisation_name: string | null
    job_title: string | null
    email: string | null
    phone: string | null
    notes: string | null
  }>(
    db,
    `SELECT c.name, mc.role, o.name AS organisation_name, c.job_title, c.email, c.phone, c.notes
     FROM matter_contacts mc
     INNER JOIN contacts c ON c.id = mc.contact_id
     LEFT JOIN organisations o ON o.id = c.organisation_id
     WHERE mc.matter_id = ?
     ORDER BY c.name COLLATE NOCASE`,
    [matterId]
  )
  const items = tasks.listItemsForMatter(db, matterId)
  const mapWork = (item: (typeof items)[number]): ContextWorkItem => ({
    type: item.type,
    title: item.title,
    status: item.status,
    priority: item.priority,
    dueAt: item.dueAt,
    waitingFor: item.waitingForDisplay,
    waitingSince: item.waitingSince,
    notes: item.notes,
    isNextAction: item.isNextAction
  })
  const timeline = events.listEventsForMatter(db, matterId)
  const docs = documents.listDocumentsForMatter(db, matterId).map((doc): ContextDocument => {
    const resolved =
      doc.storageMode === 'copy' ? absoluteManagedPath(documentsRoot, doc.managedPath) : doc.originalPath
    return {
      displayName: doc.displayName,
      storageMode: doc.storageMode === 'copy' ? 'MatterDock copy' : 'Reference original',
      notes: doc.notes,
      availability: fileExists(resolved) ? 'Available' : 'File unavailable',
      extension: doc.fileExtension,
      size: doc.fileSize,
      path: resolved
    }
  })

  return {
    generatedAt: now.toISOString(),
    matter: {
      title: matter.title,
      reference: matter.reference,
      status: matter.status,
      priority: matter.priority,
      description: matter.description,
      tags: matter.tags.map((tag) => tag.name),
      organisationName: matter.organisationName,
      createdAt: matter.createdAt,
      updatedAt: matter.updatedAt
    },
    organisation: organisation
      ? {
          name: organisation.name,
          aliases: organisation.aliases.map((alias) => alias.alias),
          notes: organisation.notes
        }
      : null,
    contacts: linked.map((row) => ({
      name: row.name,
      role: row.role,
      organisationName: row.organisation_name,
      jobTitle: row.job_title,
      email: row.email,
      phone: row.phone,
      notes: row.notes
    })),
    nextAction: items.find((item) => item.isNextAction && item.status === 'open')
      ? mapWork(items.find((item) => item.isNextAction && item.status === 'open')!)
      : null,
    actions: items.filter((item) => item.type === 'action' && item.status === 'open').map(mapWork),
    waiting: items.filter((item) => item.type === 'waiting' && item.status === 'open').map(mapWork),
    closedWork: items.filter((item) => item.status !== 'open').map(mapWork),
    timeline: [...timeline]
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map(
        (event): ContextEvent => ({
          occurredAt: event.occurredAt,
          type: event.type,
          direction: event.direction,
          title: event.title,
          contactName: event.contactName,
          subject: event.email?.subject ?? null,
          body: event.body
        })
      ),
    documents: docs
  }
}
