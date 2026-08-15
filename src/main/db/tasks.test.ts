import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { USER_ERRORS } from '@shared/errors'
import { migrate } from './migrate'
import * as contacts from './contacts'
import * as matters from './matters'
import * as organisations from './organisations'
import * as tasks from './tasks'

async function memoryDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

describe('next action', () => {
  it('keeps only one open next action per matter', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const first = tasks.createAction(db, { matterId: matter.id, title: 'Send supporting documents', setAsNextAction: true })
    const second = tasks.createAction(db, { matterId: matter.id, title: 'Call Ms Chan', setAsNextAction: true })
    expect(tasks.getTask(db, first.id).isNextAction).toBe(false)
    expect(tasks.getTask(db, second.id).isNextAction).toBe(true)
    expect(tasks.getNextActionForMatter(db, matter.id)?.id).toBe(second.id)
  })

  it('allows an open waiting item to be the next action and rejects closed items', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const waiting = tasks.createWaiting(db, {
      matterId: matter.id,
      title: 'Confirmation of subsidy amount',
      waitingForText: 'Ms Chan'
    })
    const next = tasks.setNextAction(db, waiting.id)
    expect(next.isNextAction).toBe(true)
    expect(() => tasks.completeAction(db, waiting.id)).toThrow(USER_ERRORS.notAnAction)
    const done = tasks.resolveWaiting(db, waiting.id)
    expect(done.isNextAction).toBe(false)
    expect(() => tasks.setNextAction(db, waiting.id)).toThrow(USER_ERRORS.nextActionClosed)
  })

  it('clears next action on complete and cancel, and does not auto-promote', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const first = tasks.createAction(db, { matterId: matter.id, title: 'Send pack', setAsNextAction: true })
    tasks.createAction(db, { matterId: matter.id, title: 'Other' })
    expect(tasks.completeAction(db, first.id).isNextAction).toBe(false)
    expect(tasks.getNextActionForMatter(db, matter.id)).toBeNull()

    const second = tasks.createAction(db, { matterId: matter.id, title: 'Call', setAsNextAction: true })
    expect(tasks.cancelTask(db, second.id).isNextAction).toBe(false)
    expect(tasks.getNextActionForMatter(db, matter.id)).toBeNull()
  })
})

describe('waiting', () => {
  it('keeps waiting-for text after the contact is deleted', async () => {
    const db = await memoryDb()
    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    const contact = contacts.createContact(db, { name: 'Ms Chan', organisationId: org.id })
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application', organisationId: org.id })
    const waiting = tasks.createWaiting(db, {
      matterId: matter.id,
      title: 'Confirmation of subsidy amount',
      waitingForContactId: contact.id,
      waitingSince: '2026-08-15T02:00:00.000Z',
      dueAt: '2026-08-18T02:00:00.000Z'
    })
    expect(waiting.waitingForDisplay).toBe('Ms Chan')
    contacts.removeContact(db, contact.id)
    const after = tasks.getTask(db, waiting.id)
    expect(after.waitingForContactId).toBeNull()
    expect(after.waitingForText).toBe('Ms Chan')
    expect(after.waitingForDisplay).toBe('Ms Chan')
    expect(tasks.resolveWaiting(db, waiting.id).status).toBe('done')
  })

  it('accepts free-text waiting targets', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'Land resumption' })
    const waiting = tasks.createWaiting(db, {
      matterId: matter.id,
      title: 'Confirmation letter',
      waitingForText: 'Lands Department'
    })
    expect(waiting.waitingForDisplay).toBe('Lands Department')
  })
})

describe('today classification', () => {
  it('classifies overdue, due today and undated waiting with an injected now', async () => {
    const db = await memoryDb()
    const now = new Date(2026, 7, 15, 12, 0, 0)
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    tasks.createAction(db, {
      matterId: matter.id,
      title: 'Yesterday',
      dueAt: new Date(2026, 7, 14, 10, 0, 0).toISOString()
    })
    tasks.createAction(db, {
      matterId: matter.id,
      title: 'Today',
      dueAt: new Date(2026, 7, 15, 18, 0, 0).toISOString()
    })
    tasks.createAction(db, {
      matterId: matter.id,
      title: 'Tomorrow',
      dueAt: new Date(2026, 7, 16, 9, 0, 0).toISOString()
    })
    tasks.createWaiting(db, {
      matterId: matter.id,
      title: 'No date',
      waitingForText: 'Customer'
    })
    const dashboard = tasks.getTodayDashboard(db, now)
    expect(dashboard.summary.overdue).toBe(1)
    expect(dashboard.summary.dueToday).toBe(1)
    expect(dashboard.summary.waiting).toBe(1)
    const board = tasks.listWaiting(db, now)
    expect(board.noFollowUp).toHaveLength(1)
    expect(board.upcoming).toHaveLength(0)
    expect(board.followUpDue).toHaveLength(0)
  })
})

describe('next action clear and waiting integrity', () => {
  it('clears the next action without promoting another item and touches the matter', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const first = tasks.createAction(db, { matterId: matter.id, title: 'Send pack', setAsNextAction: true })
    tasks.createAction(db, { matterId: matter.id, title: 'Other' })
    db.run(`UPDATE matters SET updated_at = ? WHERE id = ?`, ['2020-01-01T00:00:00.000Z', matter.id])
    tasks.clearNextAction(db, matter.id)
    expect(tasks.getTask(db, first.id).isNextAction).toBe(false)
    expect(tasks.getNextActionForMatter(db, matter.id)).toBeNull()
    expect(matters.getMatter(db, matter.id).updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
  })

  it('rejects a waiting update that would drop the waiting target', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const waiting = tasks.createWaiting(db, {
      matterId: matter.id,
      title: 'Confirmation',
      waitingForText: 'Ms Chan'
    })
    expect(() =>
      tasks.updateTask(db, waiting.id, { waitingForContactId: null, waitingForText: '' })
    ).toThrow(/waiting for/i)
    expect(tasks.getTask(db, waiting.id).waitingForText).toBe('Ms Chan')
  })

  it('rejects completeAction on waiting and resolveWaiting on action', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const action = tasks.createAction(db, { matterId: matter.id, title: 'Send pack' })
    const waiting = tasks.createWaiting(db, {
      matterId: matter.id,
      title: 'Reply',
      waitingForText: 'Ms Chan'
    })
    expect(() => tasks.completeAction(db, waiting.id)).toThrow(USER_ERRORS.notAnAction)
    expect(() => tasks.resolveWaiting(db, action.id)).toThrow(USER_ERRORS.notWaiting)
  })
})

describe('matter touch', () => {
  it('updates the matter when work items change', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const before = matter.updatedAt
    const action = tasks.createAction(db, { matterId: matter.id, title: 'Send pack' })
    expect(matters.getMatter(db, matter.id).updatedAt >= before).toBe(true)
    tasks.updateTask(db, action.id, { title: 'Send pack today' })
    tasks.completeAction(db, action.id)
    tasks.reopenTask(db, action.id)
    tasks.cancelTask(db, action.id)
  })
})
