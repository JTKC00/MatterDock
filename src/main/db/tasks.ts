import type { Database } from 'sql.js'
import { isDueToday, isOverdue, isUpcoming } from '@shared/day'
import { AppError, USER_ERRORS } from '@shared/errors'
import {
  createActionSchema,
  createWaitingSchema,
  formatZodError,
  updateWorkItemSchema
} from '@shared/schemas'
import type {
  CreateActionInput,
  CreateWaitingInput,
  MatterListItem,
  MatterPriority,
  TaskStatus,
  TaskType,
  TodayDashboard,
  UpdateWorkItemInput,
  WaitingBoard,
  WorkItem
} from '@shared/types'
import { ZodError } from 'zod/v3'
import { createId, nowIso } from './ids'
import { listMatters } from './matters'
import { all, get } from './sql'

type TaskRow = {
  id: string
  matter_id: string
  type: TaskType
  title: string
  notes: string | null
  status: TaskStatus
  due_at: string | null
  waiting_for_contact_id: string | null
  waiting_for_text: string | null
  waiting_since: string | null
  is_next_action: number
  priority: MatterPriority
  completed_at: string | null
  created_at: string
  updated_at: string
  contact_name: string | null
  matter_title?: string
  matter_status?: WorkItem['matterStatus']
  organisation_name?: string | null
}

export function listItemsForMatter(db: Database, matterId: string): WorkItem[] {
  return loadItems(db, 'WHERE t.matter_id = ?', [matterId])
}

export function getTask(db: Database, id: string): WorkItem {
  const item = loadItems(db, 'WHERE t.id = ?', [id])[0]
  if (!item) throw new AppError(USER_ERRORS.taskNotFound, 'TASK_NOT_FOUND')
  return item
}

export function getNextActionForMatter(db: Database, matterId: string): WorkItem | null {
  return (
    loadItems(db, 'WHERE t.matter_id = ? AND t.is_next_action = 1 AND t.status = ?', [matterId, 'open'])[0] ??
    null
  )
}

export function createAction(db: Database, input: CreateActionInput): WorkItem {
  try {
    const parsed = createActionSchema.parse(input)
    assertMatter(db, parsed.matterId)
    const now = nowIso()
    const id = createId()
    const makeNext = Boolean(parsed.setAsNextAction)
    if (makeNext) unsetNextFlags(db, parsed.matterId, now)
    db.run(
      `INSERT INTO tasks (
         id, matter_id, type, title, notes, status, due_at, waiting_for_contact_id,
         waiting_for_text, waiting_since, is_next_action, priority, completed_at, created_at, updated_at
       ) VALUES (?, ?, 'action', ?, ?, 'open', ?, NULL, NULL, NULL, ?, ?, NULL, ?, ?)`,
      [
        id,
        parsed.matterId,
        parsed.title,
        parsed.notes ?? null,
        parsed.dueAt ?? null,
        makeNext ? 1 : 0,
        parsed.priority ?? 'normal',
        now,
        now
      ]
    )
    touchMatter(db, parsed.matterId, now)
    return getTask(db, id)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function createWaiting(db: Database, input: CreateWaitingInput): WorkItem {
  try {
    const parsed = createWaitingSchema.parse(input)
    assertMatter(db, parsed.matterId)
    const snapshot = waitingSnapshot(db, parsed.waitingForContactId, parsed.waitingForText)
    const now = nowIso()
    const id = createId()
    const makeNext = Boolean(parsed.setAsNextAction)
    if (makeNext) unsetNextFlags(db, parsed.matterId, now)
    db.run(
      `INSERT INTO tasks (
         id, matter_id, type, title, notes, status, due_at, waiting_for_contact_id,
         waiting_for_text, waiting_since, is_next_action, priority, completed_at, created_at, updated_at
       ) VALUES (?, ?, 'waiting', ?, ?, 'open', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        parsed.matterId,
        parsed.title,
        parsed.notes ?? null,
        parsed.dueAt ?? null,
        parsed.waitingForContactId ?? null,
        snapshot,
        parsed.waitingSince ?? now,
        makeNext ? 1 : 0,
        parsed.priority ?? 'normal',
        now,
        now
      ]
    )
    touchMatter(db, parsed.matterId, now)
    return getTask(db, id)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function updateTask(db: Database, id: string, input: UpdateWorkItemInput): WorkItem {
  const existing = getTask(db, id)
  try {
    const parsed = updateWorkItemSchema.parse(input)
    const now = nowIso()
    const nextContactId =
      parsed.waitingForContactId === undefined ? existing.waitingForContactId : parsed.waitingForContactId
    const nextText =
      parsed.waitingForText === undefined && parsed.waitingForContactId === undefined
        ? existing.waitingForText
        : waitingSnapshot(
            db,
            nextContactId,
            parsed.waitingForText === undefined ? existing.waitingForText : parsed.waitingForText
          )
    if (existing.type === 'waiting' && !nextContactId && !nextText) {
      throw new AppError(USER_ERRORS.waitingForRequired, 'WAITING_FOR_REQUIRED')
    }
    db.run(
      `UPDATE tasks
       SET title = ?, notes = ?, due_at = ?, priority = ?, waiting_for_contact_id = ?,
           waiting_for_text = ?, waiting_since = ?, updated_at = ?
       WHERE id = ?`,
      [
        parsed.title ?? existing.title,
        parsed.notes === undefined ? existing.notes : parsed.notes,
        parsed.dueAt === undefined ? existing.dueAt : parsed.dueAt,
        parsed.priority ?? existing.priority,
        nextContactId,
        nextText,
        parsed.waitingSince === undefined ? existing.waitingSince : parsed.waitingSince,
        now,
        id
      ]
    )
    touchMatter(db, existing.matterId, now)
    return getTask(db, id)
  } catch (error) {
    if (error instanceof ZodError) throw new AppError(formatZodError(error), 'VALIDATION')
    throw error
  }
}

export function completeAction(db: Database, id: string): WorkItem {
  const existing = getTask(db, id)
  if (existing.type !== 'action') throw new AppError(USER_ERRORS.notAnAction, 'NOT_AN_ACTION')
  return closeTask(db, existing, 'done')
}

export function resolveWaiting(db: Database, id: string): WorkItem {
  const existing = getTask(db, id)
  if (existing.type !== 'waiting') throw new AppError(USER_ERRORS.notWaiting, 'NOT_WAITING')
  return closeTask(db, existing, 'done')
}

export function cancelTask(db: Database, id: string): WorkItem {
  const existing = getTask(db, id)
  return closeTask(db, existing, 'cancelled')
}

export function reopenTask(db: Database, id: string): WorkItem {
  const existing = getTask(db, id)
  if (existing.status === 'open') throw new AppError(USER_ERRORS.alreadyOpen, 'ALREADY_OPEN')
  const now = nowIso()
  db.run(
    `UPDATE tasks SET status = 'open', completed_at = NULL, is_next_action = 0, updated_at = ? WHERE id = ?`,
    [now, id]
  )
  touchMatter(db, existing.matterId, now)
  return getTask(db, id)
}

export function setNextAction(db: Database, id: string): WorkItem {
  const existing = getTask(db, id)
  if (existing.status !== 'open') throw new AppError(USER_ERRORS.nextActionClosed, 'NEXT_ACTION_CLOSED')
  const now = nowIso()
  unsetNextFlags(db, existing.matterId, now)
  db.run(`UPDATE tasks SET is_next_action = 1, updated_at = ? WHERE id = ?`, [now, id])
  touchMatter(db, existing.matterId, now)
  return getTask(db, id)
}

export function clearNextAction(db: Database, matterId: string): void {
  const now = nowIso()
  unsetNextFlags(db, matterId, now)
  touchMatter(db, matterId, now)
}

function unsetNextFlags(db: Database, matterId: string, at: string): void {
  db.run(
    `UPDATE tasks SET is_next_action = 0, updated_at = ? WHERE matter_id = ? AND is_next_action = 1`,
    [at, matterId]
  )
}

export function listWaiting(db: Database, now = new Date()): WaitingBoard {
  const items = loadItems(
    db,
    `WHERE t.type = 'waiting' AND t.status = 'open' AND m.status != 'archived'`,
    []
  ).sort(byDueThenTitle)
  return {
    followUpDue: items.filter((item) => isOverdue(item.dueAt, now) || isDueToday(item.dueAt, now)),
    upcoming: items.filter((item) => isUpcoming(item.dueAt, now)),
    noFollowUp: items.filter((item) => !item.dueAt)
  }
}

export function getTodayDashboard(db: Database, now = new Date()): TodayDashboard {
  const open = loadItems(db, `WHERE t.status = 'open' AND m.status != 'archived'`, [])
  const overdue = open.filter((item) => isOverdue(item.dueAt, now))
  const dueToday = open.filter((item) => isDueToday(item.dueAt, now))
  const waiting = open.filter((item) => item.type === 'waiting')
  const needsAttention = [...open]
    .filter((item) => isOverdue(item.dueAt, now) || isDueToday(item.dueAt, now) || item.priority === 'urgent' || item.priority === 'high')
    .sort((left, right) => rankAttention(left, right, now))
  const recentMatters: MatterListItem[] = listMatters(db, { status: 'active', sort: 'updated' }).slice(0, 8)
  return {
    summary: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      waiting: waiting.length
    },
    needsAttention,
    waiting: waiting.slice(0, 8),
    recentMatters
  }
}

function closeTask(
  db: Database,
  existing: WorkItem,
  status: Extract<TaskStatus, 'done' | 'cancelled'>
): WorkItem {
  if (existing.status !== 'open') throw new AppError(USER_ERRORS.alreadyClosed, 'ALREADY_CLOSED')
  const now = nowIso()
  db.run(
    `UPDATE tasks SET status = ?, completed_at = ?, is_next_action = 0, updated_at = ? WHERE id = ?`,
    [status, now, now, existing.id]
  )
  touchMatter(db, existing.matterId, now)
  return getTask(db, existing.id)
}

function loadItems(db: Database, where: string, params: Array<string>): WorkItem[] {
  return all<TaskRow>(
    db,
    `SELECT t.*, c.name AS contact_name, m.title AS matter_title, m.status AS matter_status,
            o.name AS organisation_name
     FROM tasks t
     LEFT JOIN contacts c ON c.id = t.waiting_for_contact_id
     LEFT JOIN matters m ON m.id = t.matter_id
     LEFT JOIN organisations o ON o.id = m.organisation_id
     ${where}
     ORDER BY t.is_next_action DESC, t.due_at IS NULL, t.due_at ASC, t.updated_at DESC`,
    params
  ).map(mapItem)
}

function mapItem(row: TaskRow): WorkItem {
  return {
    id: row.id,
    matterId: row.matter_id,
    type: row.type,
    title: row.title,
    notes: row.notes,
    status: row.status,
    dueAt: row.due_at,
    waitingForContactId: row.waiting_for_contact_id,
    waitingForText: row.waiting_for_text,
    waitingSince: row.waiting_since,
    isNextAction: row.is_next_action === 1,
    priority: row.priority,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    waitingForDisplay: row.contact_name ?? row.waiting_for_text,
    matterTitle: row.matter_title,
    matterStatus: row.matter_status,
    organisationName: row.organisation_name ?? null
  }
}

function waitingSnapshot(
  db: Database,
  contactId: string | null | undefined,
  text: string | null | undefined
): string | null {
  if (text && text.trim()) return text.trim()
  if (contactId) {
    const contact = get<{ name: string }>(db, 'SELECT name FROM contacts WHERE id = ?', [contactId])
    if (contact) return contact.name
  }
  return null
}

function assertMatter(db: Database, matterId: string): void {
  const found = get(db, 'SELECT id FROM matters WHERE id = ?', [matterId])
  if (!found) throw new AppError(USER_ERRORS.matterNotFound, 'MATTER_NOT_FOUND')
}

function touchMatter(db: Database, matterId: string, at: string): void {
  db.run('UPDATE matters SET updated_at = ? WHERE id = ?', [at, matterId])
}

function byDueThenTitle(left: WorkItem, right: WorkItem): number {
  if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt)
  if (left.dueAt) return -1
  if (right.dueAt) return 1
  return left.title.localeCompare(right.title)
}

function rankAttention(left: WorkItem, right: WorkItem, now: Date): number {
  const leftOverdue = isOverdue(left.dueAt, now) ? 0 : isDueToday(left.dueAt, now) ? 1 : 2
  const rightOverdue = isOverdue(right.dueAt, now) ? 0 : isDueToday(right.dueAt, now) ? 1 : 2
  if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue
  const priorityRank: Record<MatterPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
  if (priorityRank[left.priority] !== priorityRank[right.priority]) {
    return priorityRank[left.priority] - priorityRank[right.priority]
  }
  return (left.dueAt ?? '').localeCompare(right.dueAt ?? '')
}
