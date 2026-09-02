import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { appliedVersions, migrate } from './migrate'
import { migrations } from './migrations'
import { get } from './sql'
import * as events from './events'
import * as matters from './matters'
import * as organisations from './organisations'
import * as tasks from './tasks'
import type { MatterRow } from './mappers'

async function emptyDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  return db
}

describe('migration v6', () => {
  it('upgrades a v5 database without changing Matter workflow or archive history', async () => {
    const db = await emptyDb()
    for (const migration of migrations.slice(0, 5)) {
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
      [4, 'tasks_waiting_next_action'],
      [5, 'documents']
    ] as const) {
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        version,
        name,
        '2026-09-01T00:00:00.000Z'
      ])
    }

    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    const waiting = matters.createMatter(db, {
      title: 'EMPF Subsidy Application',
      organisationId: org.id,
      status: 'waiting'
    })
    const archived = matters.archiveMatter(
      db,
      matters.createMatter(db, { title: 'Completed archive', organisationId: org.id, status: 'completed' }).id
    )
    events.createEvent(db, { matterId: waiting.id, type: 'note', body: 'Prepared documents.' })
    tasks.createAction(db, { matterId: waiting.id, title: 'Send pack', setAsNextAction: true })

    const beforeWaiting = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [waiting.id])
    const beforeArchived = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [archived.id])
    expect(beforeWaiting?.status).toBe('waiting')
    expect(beforeArchived?.status).toBe('archived')
    expect(beforeArchived?.status_before_archive).toBe('completed')
    expect(beforeArchived?.completed_at).toBeTruthy()
    expect('trashed_at' in (beforeWaiting ?? {})).toBe(false)

    expect(appliedVersions(db)).toEqual([1, 2, 3, 4, 5])
    expect(migrate(db)).toEqual([6])

    const columns = db.exec('PRAGMA table_info(matters)')[0].values.map((row) => row[1])
    expect(columns).toContain('trashed_at')

    const afterWaiting = matters.getMatter(db, waiting.id)
    const afterArchived = matters.getMatter(db, archived.id)
    expect(afterWaiting.status).toBe('waiting')
    expect(afterWaiting.trashedAt).toBeNull()
    expect(afterArchived.status).toBe('archived')
    expect(afterArchived.completedAt).toBe(beforeArchived?.completed_at ?? null)
    expect(afterArchived.archivedAt).toBe(beforeArchived?.archived_at ?? null)
    expect(afterArchived.trashedAt).toBeNull()
    expect(get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [archived.id])?.status_before_archive).toBe(
      'completed'
    )
    expect(events.listEventsForMatter(db, waiting.id)).toHaveLength(1)
    expect(tasks.getNextActionForMatter(db, waiting.id)?.title).toBe('Send pack')
  })

  it('applies v6 on a fresh database and leaves new Matters live', async () => {
    const db = await emptyDb()
    expect(migrate(db)).toEqual([1, 2, 3, 4, 5, 6])
    const matter = matters.createMatter(db, { title: 'Fresh Matter', status: 'in_progress' })
    expect(matter.trashedAt).toBeNull()
    expect(matters.listMatters(db, { status: 'all' }).map((item) => item.id)).toEqual([matter.id])
    expect(matters.listMatters(db, { scope: 'trash', status: 'all' })).toHaveLength(0)
  })
})
