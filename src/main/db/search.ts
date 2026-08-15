import { join } from 'node:path'
import type { Database } from 'sql.js'
import { normalizeAlias } from '@shared/normalize'
import type { SearchGroup, SearchResponse } from '@shared/types'
import { fileExists } from '../documents/files'
import { all } from './sql'

const PER_GROUP = 8
const TOTAL_LIMIT = 40

function searchNorm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
}

function likePattern(query: string): string {
  return `%${query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
}

function scoreField(query: string, value: string | null | undefined, exact: number, prefix: number, contains: number): number {
  if (!value) return 0
  const hay = searchNorm(value)
  if (!hay) return 0
  if (hay === query) return exact
  if (hay.startsWith(query)) return prefix
  if (hay.includes(query)) return contains
  return 0
}

function snippetAround(value: string | null | undefined, query: string, tokens: string[]): string | null {
  if (!value) return null
  const hay = searchNorm(value)
  let index = hay.indexOf(query)
  let length = query.length
  if (index < 0) {
    const token = tokens.find((item) => hay.includes(item))
    if (!token) return null
    index = hay.indexOf(token)
    length = token.length
  }
  const start = Math.max(0, index - 32)
  const end = Math.min(value.length, index + length + 48)
  const slice = value.slice(start, end).trim()
  return `${start > 0 ? '…' : ''}${slice}${end < value.length ? '…' : ''}`
}

function bestScore(
  query: string,
  tokens: string[],
  fields: Array<{ value: string | null | undefined; exact: number; prefix: number; contains: number }>
): number {
  const full = fields.reduce((max, field) => Math.max(max, scoreField(query, field.value, field.exact, field.prefix, field.contains)), 0)
  if (full > 0) return full
  const hay = searchNorm(fields.map((field) => field.value ?? '').join(' '))
  if (!tokens.every((token) => hay.includes(token))) return 0
  const tokenHits = tokens.map((token) =>
    fields.reduce((max, field) => Math.max(max, scoreField(token, field.value, field.exact, field.prefix, field.contains)), 0)
  )
  return Math.max(1, Math.round(tokenHits.reduce((sum, value) => sum + value, 0) / tokens.length) - 8)
}

function aliasList(raw: string | null): string[] {
  if (!raw) return []
  return raw.split('\u001f').filter(Boolean)
}

function tokenWhere(columns: string[], tokens: string[]): { sql: string; params: string[] } {
  const groups = tokens.map(() => {
    const parts = columns.map((column) => `${column} LIKE ? ESCAPE '\\'`)
    return `(${parts.join(' OR ')})`
  })
  return {
    sql: groups.join(' AND '),
    params: tokens.flatMap((token) => columns.map(() => likePattern(token)))
  }
}

export function globalSearch(db: Database, rawQuery: string, documentsRoot?: string): SearchResponse {
  const query = searchNorm(rawQuery)
  if (!query) return { query: rawQuery, groups: [], hits: [] }
  const tokens = query.split(' ').filter(Boolean)

  const matterWhere = tokenWhere(
    ['m.title', "IFNULL(m.reference, '')", "IFNULL(m.description, '')", "IFNULL(o.name, '')", "IFNULL(a.alias, '')", "IFNULL(a.normalized_alias, '')"],
    tokens
  )
  const matters = all<{
    id: string
    title: string
    reference: string | null
    description: string | null
    status: string
    organisation_name: string | null
    aliases: string | null
  }>(
    db,
    `SELECT DISTINCT m.id, m.title, m.reference, m.description, m.status, o.name AS organisation_name,
            (SELECT GROUP_CONCAT(alias, char(31)) FROM organisation_aliases WHERE organisation_id = o.id) AS aliases
     FROM matters m
     LEFT JOIN organisations o ON o.id = m.organisation_id
     LEFT JOIN organisation_aliases a ON a.organisation_id = o.id
     WHERE ${matterWhere.sql}`,
    matterWhere.params
  )
    .map((row) => {
      const aliases = aliasList(row.aliases)
      const score = bestScore(query, tokens, [
        { value: row.title, exact: 100, prefix: 70, contains: 50 },
        { value: row.reference, exact: 98, prefix: 68, contains: 48 },
        { value: row.organisation_name, exact: 90, prefix: 55, contains: 35 },
        ...aliases.flatMap((alias) => [
          { value: alias, exact: 90, prefix: 58, contains: 38 },
          { value: normalizeAlias(alias), exact: 90, prefix: 58, contains: 38 }
        ]),
        { value: row.description, exact: 40, prefix: 28, contains: 18 }
      ])
      return {
        id: row.id,
        type: 'matter' as const,
        label: 'Matter',
        title: row.title,
        subtitle: [row.organisation_name, row.reference].filter(Boolean).join(' · '),
        snippet: snippetAround(row.description, query, tokens),
        href: `/matters/${row.id}`,
        matterId: row.id,
        matterTitle: row.title,
        archived: row.status === 'archived',
        score
      }
    })
    .filter((hit) => hit.score > 0)

  const orgWhere = tokenWhere(
    ['o.name', "IFNULL(o.notes, '')", "IFNULL(a.alias, '')", "IFNULL(a.normalized_alias, '')"],
    tokens
  )
  const organisations = all<{ id: string; name: string; notes: string | null; aliases: string | null }>(
    db,
    `SELECT o.id, o.name, o.notes,
            (SELECT GROUP_CONCAT(alias, char(31)) FROM organisation_aliases WHERE organisation_id = o.id) AS aliases
     FROM organisations o
     LEFT JOIN organisation_aliases a ON a.organisation_id = o.id
     WHERE ${orgWhere.sql}
     GROUP BY o.id`,
    orgWhere.params
  )
    .map((row) => {
      const aliases = aliasList(row.aliases)
      const score = Math.max(
        bestScore(query, tokens, [
          { value: row.name, exact: 96, prefix: 66, contains: 46 },
          { value: row.notes, exact: 30, prefix: 20, contains: 14 }
        ]),
        ...aliases.map((alias) =>
          bestScore(query, tokens, [
            { value: alias, exact: 94, prefix: 64, contains: 44 },
            { value: normalizeAlias(alias), exact: 94, prefix: 64, contains: 44 }
          ])
        )
      )
      return {
        id: row.id,
        type: 'organisation' as const,
        label: 'Organisation',
        title: row.name,
        subtitle: aliases.length ? `Aliases: ${aliases.join(', ')}` : 'Organisation',
        snippet: snippetAround(row.notes, query, tokens),
        href: `/organisations/${row.id}`,
        matterId: null,
        matterTitle: null,
        archived: false,
        score
      }
    })
    .filter((hit) => hit.score > 0)

  const contactWhere = tokenWhere(
    ['c.name', "IFNULL(c.job_title, '')", "IFNULL(c.email, '')", "IFNULL(c.phone, '')", "IFNULL(o.name, '')"],
    tokens
  )
  const contacts = all<{
    id: string
    name: string
    job_title: string | null
    email: string | null
    phone: string | null
    organisation_name: string | null
    matter_count: number
  }>(
    db,
    `SELECT c.id, c.name, c.job_title, c.email, c.phone, o.name AS organisation_name,
            (SELECT COUNT(*) FROM matter_contacts mc WHERE mc.contact_id = c.id) AS matter_count
     FROM contacts c
     LEFT JOIN organisations o ON o.id = c.organisation_id
     WHERE ${contactWhere.sql}`,
    contactWhere.params
  )
    .map((row) => {
      const score = bestScore(query, tokens, [
        { value: row.name, exact: 95, prefix: 65, contains: 45 },
        { value: row.job_title, exact: 55, prefix: 35, contains: 22 },
        { value: row.email, exact: 60, prefix: 38, contains: 24 },
        { value: row.phone, exact: 50, prefix: 30, contains: 20 },
        { value: row.organisation_name, exact: 40, prefix: 26, contains: 16 }
      ])
      const related = row.matter_count === 1 ? 'Related to 1 matter' : `Related to ${row.matter_count} matters`
      return {
        id: row.id,
        type: 'contact' as const,
        label: 'Contact',
        title: row.name,
        subtitle: [row.organisation_name ?? 'No organisation', related].join(' · '),
        snippet: snippetAround(row.job_title ?? row.email, query, tokens),
        href: `/contacts/${row.id}`,
        matterId: null,
        matterTitle: null,
        archived: false,
        score
      }
    })
    .filter((hit) => hit.score > 0)

  const eventWhere = tokenWhere(
    [
      "IFNULL(e.title, '')",
      "IFNULL(e.body, '')",
      "IFNULL(d.subject, '')",
      "IFNULL(d.from_address, '')",
      "IFNULL(d.to_addresses, '')",
      "IFNULL(d.cc_addresses, '')"
    ],
    tokens
  )
  const events = all<{
    id: string
    matter_id: string
    matter_title: string
    matter_status: string
    type: string
    title: string | null
    body: string | null
    subject: string | null
    from_address: string | null
    to_addresses: string | null
    cc_addresses: string | null
  }>(
    db,
    `SELECT e.id, e.matter_id, m.title AS matter_title, m.status AS matter_status, e.type, e.title, e.body,
            d.subject, d.from_address, d.to_addresses, d.cc_addresses
     FROM events e
     JOIN matters m ON m.id = e.matter_id
     LEFT JOIN event_email_details d ON d.event_id = e.id
     WHERE ${eventWhere.sql}`,
    eventWhere.params
  )
    .map((row) => {
      const score = bestScore(query, tokens, [
        { value: row.title, exact: 80, prefix: 52, contains: 36 },
        { value: row.subject, exact: 82, prefix: 54, contains: 38 },
        { value: row.body, exact: 42, prefix: 28, contains: 20 },
        { value: row.from_address, exact: 40, prefix: 24, contains: 16 },
        { value: row.to_addresses, exact: 36, prefix: 22, contains: 14 },
        { value: row.cc_addresses, exact: 30, prefix: 18, contains: 12 }
      ])
      const eventLabel: Record<string, string> = {
        note: 'Note',
        phone: 'Phone',
        email: 'Email',
        whatsapp: 'WhatsApp',
        meeting: 'Meeting',
        letter: 'Letter'
      }
      return {
        id: row.id,
        type: 'event' as const,
        label: eventLabel[row.type] ?? 'Activity',
        title: row.title || row.subject || row.body?.slice(0, 80) || eventLabel[row.type] || 'Activity',
        subtitle: row.matter_title,
        snippet: snippetAround(row.body ?? row.subject, query, tokens),
        href: `/matters/${row.matter_id}`,
        matterId: row.matter_id,
        matterTitle: row.matter_title,
        archived: row.matter_status === 'archived',
        score
      }
    })
    .filter((hit) => hit.score > 0)

  const taskWhere = tokenWhere(["t.title", "IFNULL(t.notes, '')", "IFNULL(t.waiting_for_text, '')"], tokens)
  const tasks = all<{
    id: string
    matter_id: string
    matter_title: string
    matter_status: string
    type: string
    title: string
    notes: string | null
    waiting_for_text: string | null
  }>(
    db,
    `SELECT t.id, t.matter_id, m.title AS matter_title, m.status AS matter_status, t.type, t.title, t.notes,
            t.waiting_for_text
     FROM tasks t
     JOIN matters m ON m.id = t.matter_id
     WHERE ${taskWhere.sql}`,
    taskWhere.params
  )
    .map((row) => {
      const score = bestScore(query, tokens, [
        { value: row.title, exact: 84, prefix: 56, contains: 40 },
        { value: row.waiting_for_text, exact: 70, prefix: 42, contains: 28 },
        { value: row.notes, exact: 38, prefix: 24, contains: 16 }
      ])
      return {
        id: row.id,
        type: 'task' as const,
        label: row.type === 'waiting' ? 'Waiting' : 'Action',
        title: row.title,
        subtitle:
          row.type === 'waiting' && row.waiting_for_text
            ? `Waiting for ${row.waiting_for_text} · ${row.matter_title}`
            : row.matter_title,
        snippet: snippetAround(row.notes, query, tokens),
        href: `/matters/${row.matter_id}`,
        matterId: row.matter_id,
        matterTitle: row.matter_title,
        archived: row.matter_status === 'archived',
        score
      }
    })
    .filter((hit) => hit.score > 0)

  const documentWhere = tokenWhere(
    ['d.display_name', "IFNULL(d.notes, '')", "IFNULL(d.file_extension, '')", "IFNULL(d.original_path, '')"],
    tokens
  )
  const docs = all<{
    id: string
    matter_id: string
    matter_title: string
    matter_status: string
    display_name: string
    notes: string | null
    file_extension: string | null
    original_path: string | null
    storage_mode: string
    managed_path: string | null
  }>(
    db,
    `SELECT d.id, d.matter_id, m.title AS matter_title, m.status AS matter_status, d.display_name, d.notes,
            d.file_extension, d.original_path, d.storage_mode, d.managed_path
     FROM documents d
     JOIN matters m ON m.id = d.matter_id
     WHERE ${documentWhere.sql}`,
    documentWhere.params
  )
    .map((row) => {
      const basename = row.original_path?.split(/[/\\]/).pop() ?? null
      const score = bestScore(query, tokens, [
        { value: row.display_name, exact: 92, prefix: 62, contains: 44 },
        { value: basename, exact: 88, prefix: 58, contains: 40 },
        { value: row.file_extension, exact: 50, prefix: 20, contains: 12 },
        { value: row.notes, exact: 36, prefix: 22, contains: 15 }
      ])
      const unavailable =
        row.storage_mode === 'copy'
          ? Boolean(documentsRoot) && !fileExists(row.managed_path && documentsRoot ? join(documentsRoot, row.managed_path) : null)
          : !fileExists(row.original_path)
      return {
        id: row.id,
        type: 'document' as const,
        label: (row.file_extension || 'File').toUpperCase(),
        title: row.display_name,
        subtitle: `${row.storage_mode === 'copy' ? 'MatterDock copy' : 'Reference original'} · ${row.matter_title}`,
        snippet: snippetAround(row.notes ?? basename, query, tokens),
        href: `/matters/${row.matter_id}`,
        matterId: row.matter_id,
        matterTitle: row.matter_title,
        archived: row.matter_status === 'archived',
        score,
        fileUnavailable: unavailable
      }
    })
    .filter((hit) => hit.score > 0)

  const groups: SearchGroup[] = [
    { key: 'matters', label: 'Matters', hits: matters },
    { key: 'activity', label: 'Activity', hits: events },
    { key: 'work', label: 'Actions & Waiting', hits: tasks },
    { key: 'people', label: 'Contacts / Organisations', hits: [...organisations, ...contacts] },
    { key: 'documents', label: 'Documents', hits: docs }
  ]
    .map((group) => ({
      ...group,
      hits: [...group.hits].sort(byScore).slice(0, PER_GROUP)
    }))
    .filter((group) => group.hits.length > 0)

  const hits = [...matters, ...events, ...tasks, ...organisations, ...contacts, ...docs].sort(byScore).slice(0, TOTAL_LIMIT)
  return { query: rawQuery.trim(), groups, hits }
}

function byScore(left: { score: number; title: string }, right: { score: number; title: string }): number {
  if (right.score !== left.score) return right.score - left.score
  return left.title.localeCompare(right.title)
}
