import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { appliedVersions, migrate } from './migrate'
import { migrations } from './migrations'
import { tableNames } from './sql'
import * as events from './events'
import * as matters from './matters'
import * as organisations from './organisations'
import * as tasks from './tasks'

async function emptyDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  return db
}

describe('migration v5', () => {
  it('upgrades a 0.3.2 database without losing work items or timeline', async () => {
    const db = await emptyDb()
    for (const migration of migrations.slice(0, 4)) {
      db.run(migration.sql)
    }
    db.run(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`
    )
    for (const [version, name] of [
      [1, 'foundation'],
      [2, 'archive_previous_status'],
      [3, 'matter_timeline'],
      [4, 'tasks_waiting_next_action']
    ] as const) {
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        version,
        name,
        '2026-08-15T00:00:00.000Z'
      ])
    }

    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application', organisationId: org.id })
    events.createEvent(db, { matterId: matter.id, type: 'note', body: 'Prepared documents.' })
    tasks.createAction(db, { matterId: matter.id, title: 'Send pack', setAsNextAction: true })

    expect(appliedVersions(db)).toEqual([1, 2, 3, 4])
    expect(migrate(db)).toEqual([5, 6])
    expect(tableNames(db)).toContain('documents')
    expect(events.listEventsForMatter(db, matter.id)).toHaveLength(1)
    expect(tasks.getNextActionForMatter(db, matter.id)?.title).toBe('Send pack')
    expect(matters.getMatter(db, matter.id).title).toBe('EMPF Subsidy Application')
  })
})
