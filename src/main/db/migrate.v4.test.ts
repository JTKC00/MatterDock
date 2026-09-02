import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { appliedVersions, migrate } from './migrate'
import { migrations } from './migrations'
import { tableNames } from './sql'
import * as events from './events'
import * as matters from './matters'
import * as organisations from './organisations'

async function emptyDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  return db
}

describe('migration v4', () => {
  it('upgrades a 0.2.1 database without losing timeline data', async () => {
    const db = await emptyDb()
    db.run(migrations[0].sql)
    db.run(migrations[1].sql)
    db.run(migrations[2].sql)
    db.run(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`
    )
    db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, ?, ?)', [
      'foundation',
      '2026-08-15T00:00:00.000Z'
    ])
    db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, ?, ?)', [
      'archive_previous_status',
      '2026-08-15T01:00:00.000Z'
    ])
    db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (3, ?, ?)', [
      'matter_timeline',
      '2026-08-15T02:00:00.000Z'
    ])

    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application', organisationId: org.id })
    events.createEvent(db, { matterId: matter.id, type: 'note', body: 'Prepared documents.' })

    expect(appliedVersions(db)).toEqual([1, 2, 3])
    expect(migrate(db)).toEqual([4, 5, 6])
    expect(tableNames(db)).toContain('tasks')
    expect(events.listEventsForMatter(db, matter.id)).toHaveLength(1)
    expect(matters.getMatter(db, matter.id).title).toBe('EMPF Subsidy Application')
  })
})
