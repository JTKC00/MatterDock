import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Database } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'
import { DATA_EXPORT_SCHEMA_VERSION } from '@shared/backup'
import type { DatabaseStore } from '../db/store'
import { all } from '../db/sql'
import { collectManagedSnapshot } from './snapshot'
import { toCsv } from './csv'

export type CreateDataExportInput = {
  store: DatabaseStore
  documentsRoot: string
  destinationDirectory: string
  appVersion: string
  now?: () => string
}

export async function createDataExport(input: CreateDataExportInput): Promise<string> {
  const generatedAt = (input.now ?? (() => new Date().toISOString()))()
  const folderName = `MatterDock-Data-Export-${generatedAt.slice(0, 10)}`
  let destination = join(input.destinationDirectory, folderName)
  if (existsSync(destination)) {
    destination = join(input.destinationDirectory, `MatterDock-Data-Export-${stamp(generatedAt)}`)
  }
  const staging = `${destination}.tmp`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  try {
    await input.store.withExclusive('export', async () => {
      input.store.persist()
      const payload = input.store.query((db) => buildExportPayload(db, input.appVersion, generatedAt))
      const managed = input.store.query((db) => collectManagedSnapshot(db, input.documentsRoot))
      writeFileSync(join(staging, 'matterdock.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      writeCsvFiles(join(staging, 'csv'), payload)
      writeFileSync(join(staging, 'README.txt'), buildReadme(payload, generatedAt, input.appVersion), 'utf8')
      const managedRoot = join(staging, 'managed-documents')
      mkdirSync(managedRoot, { recursive: true })
      for (const file of managed) {
        const dest = join(managedRoot, file.documentId, file.archivePath.split('/').pop() ?? 'document')
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(file.sourcePath, dest)
      }
    })
    mkdirSync(input.destinationDirectory, { recursive: true })
    renameSync(staging, destination)
    return destination
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    if (error instanceof AppError) {
      if (error.code === 'BACKUP_MANAGED_MISSING' || error.code === 'BACKUP_QUARANTINE') {
        throw new AppError(USER_ERRORS.exportFailed, 'EXPORT_FAILED', { cause: error })
      }
      throw error
    }
    throw new AppError(USER_ERRORS.exportFailed, 'EXPORT_FAILED', { cause: error })
  }
}

type ExportPayload = ReturnType<typeof buildExportPayload>

function buildExportPayload(db: Database, appVersion: string, generatedAt: string) {
  return {
    exportSchemaVersion: DATA_EXPORT_SCHEMA_VERSION,
    app: 'MatterDock' as const,
    appVersion,
    generatedAt,
    organisations: all<Record<string, unknown>>(db, 'SELECT * FROM organisations ORDER BY created_at, id').map(
      mapOrg
    ),
    organisationAliases: all<Record<string, unknown>>(
      db,
      'SELECT * FROM organisation_aliases ORDER BY created_at, id'
    ).map(mapAlias),
    contacts: all<Record<string, unknown>>(db, 'SELECT * FROM contacts ORDER BY created_at, id').map(mapContact),
    matters: all<Record<string, unknown>>(db, 'SELECT * FROM matters ORDER BY created_at, id').map(mapMatter),
    matterContacts: all<Record<string, unknown>>(
      db,
      'SELECT * FROM matter_contacts ORDER BY matter_id, contact_id'
    ).map((row) => ({
      matterId: str(row.matter_id),
      contactId: str(row.contact_id),
      role: strOrNull(row.role)
    })),
    tags: all<Record<string, unknown>>(db, 'SELECT * FROM tags ORDER BY name, id').map((row) => ({
      id: str(row.id),
      name: str(row.name)
    })),
    matterTags: all<Record<string, unknown>>(db, 'SELECT * FROM matter_tags ORDER BY matter_id, tag_id').map(
      (row) => ({
        matterId: str(row.matter_id),
        tagId: str(row.tag_id)
      })
    ),
    timeline: all<Record<string, unknown>>(
      db,
      `SELECT e.*, d.from_address, d.to_addresses, d.cc_addresses, d.subject
       FROM events e
       LEFT JOIN event_email_details d ON d.event_id = e.id
       ORDER BY e.occurred_at, e.id`
    ).map(mapEvent),
    workItems: all<Record<string, unknown>>(db, 'SELECT * FROM tasks ORDER BY created_at, id').map(mapTask),
    documents: all<Record<string, unknown>>(db, 'SELECT * FROM documents ORDER BY created_at, id').map(mapDocument)
  }
}

function writeCsvFiles(csvDir: string, payload: ExportPayload): void {
  mkdirSync(csvDir, { recursive: true })
  writeFileSync(
    join(csvDir, 'organisations.csv'),
    toCsv(
      ['id', 'name', 'notes', 'created_at', 'updated_at'],
      payload.organisations.map((row) => [row.id, row.name, row.notes, row.createdAt, row.updatedAt])
    ),
    'utf8'
  )
  writeFileSync(
    join(csvDir, 'organisation-aliases.csv'),
    toCsv(
      ['id', 'organisation_id', 'alias', 'normalized_alias', 'created_at'],
      payload.organisationAliases.map((row) => [
        row.id,
        row.organisationId,
        row.alias,
        row.normalizedAlias,
        row.createdAt
      ])
    ),
    'utf8'
  )
  writeFileSync(
    join(csvDir, 'contacts.csv'),
    toCsv(
      ['id', 'organisation_id', 'name', 'job_title', 'phone', 'email', 'notes', 'created_at', 'updated_at'],
      payload.contacts.map((row) => [
        row.id,
        row.organisationId,
        row.name,
        row.jobTitle,
        row.phone,
        row.email,
        row.notes,
        row.createdAt,
        row.updatedAt
      ])
    ),
    'utf8'
  )
  writeFileSync(
    join(csvDir, 'matters.csv'),
    toCsv(
      [
        'id',
        'title',
        'organisation_id',
        'reference',
        'status',
        'priority',
        'description',
        'created_at',
        'updated_at',
        'completed_at',
        'archived_at',
        'status_before_archive'
      ],
      payload.matters.map((row) => [
        row.id,
        row.title,
        row.organisationId,
        row.reference,
        row.status,
        row.priority,
        row.description,
        row.createdAt,
        row.updatedAt,
        row.completedAt,
        row.archivedAt,
        row.statusBeforeArchive
      ])
    ),
    'utf8'
  )
  writeFileSync(
    join(csvDir, 'matter-contacts.csv'),
    toCsv(
      ['matter_id', 'contact_id', 'role'],
      payload.matterContacts.map((row) => [row.matterId, row.contactId, row.role])
    ),
    'utf8'
  )
  writeFileSync(
    join(csvDir, 'timeline.csv'),
    toCsv(
      [
        'id',
        'matter_id',
        'type',
        'title',
        'body',
        'contact_id',
        'direction',
        'occurred_at',
        'created_at',
        'updated_at',
        'from_address',
        'to_addresses',
        'cc_addresses',
        'subject'
      ],
      payload.timeline.map((row) => [
        row.id,
        row.matterId,
        row.type,
        row.title,
        row.body,
        row.contactId,
        row.direction,
        row.occurredAt,
        row.createdAt,
        row.updatedAt,
        row.email?.fromAddress ?? null,
        row.email?.toAddresses ?? null,
        row.email?.ccAddresses ?? null,
        row.email?.subject ?? null
      ])
    ),
    'utf8'
  )
  writeFileSync(
    join(csvDir, 'work-items.csv'),
    toCsv(
      [
        'id',
        'matter_id',
        'type',
        'title',
        'notes',
        'status',
        'due_at',
        'waiting_for_contact_id',
        'waiting_for_text',
        'waiting_since',
        'is_next_action',
        'priority',
        'completed_at',
        'created_at',
        'updated_at'
      ],
      payload.workItems.map((row) => [
        row.id,
        row.matterId,
        row.type,
        row.title,
        row.notes,
        row.status,
        row.dueAt,
        row.waitingForContactId,
        row.waitingForText,
        row.waitingSince,
        row.isNextAction ? 1 : 0,
        row.priority,
        row.completedAt,
        row.createdAt,
        row.updatedAt
      ])
    ),
    'utf8'
  )
  writeFileSync(
    join(csvDir, 'documents.csv'),
    toCsv(
      [
        'id',
        'matter_id',
        'display_name',
        'storage_mode',
        'original_path',
        'managed_path',
        'file_extension',
        'mime_type',
        'file_size',
        'notes',
        'created_at',
        'updated_at'
      ],
      payload.documents.map((row) => [
        row.id,
        row.matterId,
        row.displayName,
        row.storageMode,
        row.originalPath,
        row.managedPath,
        row.fileExtension,
        row.mimeType,
        row.fileSize,
        row.notes,
        row.createdAt,
        row.updatedAt
      ])
    ),
    'utf8'
  )
}

function buildReadme(payload: ExportPayload, generatedAt: string, appVersion: string): string {
  const matterCount = payload.matters.length
  const contactCount = payload.contacts.length
  const documentCount = payload.documents.length
  return [
    'MatterDock Data Export',
    '',
    `Generated: ${generatedAt}`,
    `App version: ${appVersion}`,
    `Export schema: ${DATA_EXPORT_SCHEMA_VERSION}`,
    '',
    'This export may contain personal or confidential information. Store it securely.',
    '',
    'Files:',
    '- matterdock.json is the canonical open structured export of this workspace',
    '- csv contains table files for spreadsheets and other tools',
    '- managed-documents contains MatterDock workspace copies',
    '- README.txt is this file',
    '',
    'JSON is the canonical open structured export.',
    'CSV is a table form of the same records. Stable IDs are included so relationships can be joined together.',
    '',
    'Managed copies are MatterDock-owned files and are included.',
    'Referenced original files are not copied. Their original paths remain as metadata only.',
    '',
    'This export is not a MatterDock backup and cannot restore a MatterDock workspace.',
    '',
    `Records: ${matterCount} matters, ${contactCount} contacts, ${documentCount} documents.`,
    ''
  ].join('\n')
}

function str(value: unknown): string {
  return String(value ?? '')
}

function strOrNull(value: unknown): string | null {
  return value == null ? null : String(value)
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function mapOrg(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    name: str(row.name),
    notes: strOrNull(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at)
  }
}

function mapAlias(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    alias: str(row.alias),
    normalizedAlias: str(row.normalized_alias),
    createdAt: str(row.created_at)
  }
}

function mapContact(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    organisationId: strOrNull(row.organisation_id),
    name: str(row.name),
    jobTitle: strOrNull(row.job_title),
    phone: strOrNull(row.phone),
    email: strOrNull(row.email),
    notes: strOrNull(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at)
  }
}

function mapMatter(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    title: str(row.title),
    organisationId: strOrNull(row.organisation_id),
    reference: strOrNull(row.reference),
    status: str(row.status),
    priority: str(row.priority),
    description: strOrNull(row.description),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    completedAt: strOrNull(row.completed_at),
    archivedAt: strOrNull(row.archived_at),
    statusBeforeArchive: strOrNull(row.status_before_archive)
  }
}

function mapEvent(row: Record<string, unknown>) {
  const hasEmail =
    row.from_address != null || row.to_addresses != null || row.cc_addresses != null || row.subject != null
  return {
    id: str(row.id),
    matterId: str(row.matter_id),
    type: str(row.type),
    title: strOrNull(row.title),
    body: strOrNull(row.body),
    contactId: strOrNull(row.contact_id),
    direction: strOrNull(row.direction),
    occurredAt: str(row.occurred_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    email: hasEmail
      ? {
          fromAddress: strOrNull(row.from_address),
          toAddresses: strOrNull(row.to_addresses),
          ccAddresses: strOrNull(row.cc_addresses),
          subject: strOrNull(row.subject)
        }
      : null
  }
}

function mapTask(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    matterId: str(row.matter_id),
    type: str(row.type),
    title: str(row.title),
    notes: strOrNull(row.notes),
    status: str(row.status),
    dueAt: strOrNull(row.due_at),
    waitingForContactId: strOrNull(row.waiting_for_contact_id),
    waitingForText: strOrNull(row.waiting_for_text),
    waitingSince: strOrNull(row.waiting_since),
    isNextAction: Number(row.is_next_action) === 1,
    priority: str(row.priority),
    completedAt: strOrNull(row.completed_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at)
  }
}

function mapDocument(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    matterId: str(row.matter_id),
    displayName: str(row.display_name),
    storageMode: str(row.storage_mode),
    originalPath: strOrNull(row.original_path),
    managedPath: strOrNull(row.managed_path),
    fileExtension: strOrNull(row.file_extension),
    mimeType: strOrNull(row.mime_type),
    fileSize: numOrNull(row.file_size),
    notes: strOrNull(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at)
  }
}

function stamp(iso: string): string {
  return iso.replaceAll(':', '-').replaceAll('.', '-')
}
