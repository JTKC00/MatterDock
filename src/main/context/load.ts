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
    organisation_id: string | null
    organisation_name: string | null
    job_title: string | null
    email: string | null
    phone: string | null
    notes: string | null
  }>(
    db,
    `SELECT c.name, mc.role, c.organisation_id, o.name AS organisation_name, c.job_title, c.email, c.phone, c.notes
     FROM matter_contacts mc
     INNER JOIN contacts c ON c.id = mc.contact_id
     LEFT JOIN organisations o ON o.id = c.organisation_id
     WHERE mc.matter_id = ?
     ORDER BY c.name COLLATE NOCASE`,
    [matterId]
  )
  const organisationIds = new Set<string>()
  if (matter.organisationId) organisationIds.add(matter.organisationId)
  for (const row of linked) {
    if (row.organisation_id) organisationIds.add(row.organisation_id)
  }
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
    documents: docs,
    privacySources: {
      organisations: loadOrganisationPrivacySources(db, [...organisationIds], matter.organisationId)
    }
  }
}

function loadOrganisationPrivacySources(
  db: Database,
  ids: string[],
  matterOrganisationId: string | null
): { name: string; aliases: string[] }[] {
  if (ids.length === 0) return []
  const rows = all<{ id: string; name: string; alias: string | null }>(
    db,
    `SELECT o.id, o.name, a.alias
     FROM organisations o
     LEFT JOIN organisation_aliases a ON a.organisation_id = o.id
     WHERE o.id IN (${ids.map(() => '?').join(',')})
     ORDER BY o.name COLLATE NOCASE, a.alias COLLATE NOCASE`,
    ids
  )
  const byId = new Map<string, { name: string; aliases: string[] }>()
  for (const row of rows) {
    const current = byId.get(row.id) ?? { name: row.name, aliases: [] }
    if (row.alias && !current.aliases.includes(row.alias)) current.aliases.push(row.alias)
    byId.set(row.id, current)
  }
  const ordered: { name: string; aliases: string[] }[] = []
  if (matterOrganisationId) {
    const matterOrg = byId.get(matterOrganisationId)
    if (matterOrg) {
      ordered.push(matterOrg)
      byId.delete(matterOrganisationId)
    }
  }
  for (const organisation of [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  )) {
    ordered.push(organisation)
  }
  return ordered
}
