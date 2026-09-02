import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { appliedVersions, migrate } from './migrate'
import { migrations } from './migrations'
import { exec, get, tableNames } from './sql'
import * as organisations from './organisations'
import * as contacts from './contacts'
import * as matters from './matters'

async function emptyDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  return db
}

describe('migration v2', () => {
  it('applies foundation then archive_previous_status on a fresh database', async () => {
    const db = await emptyDb()
    const ran = migrate(db)
    expect(ran).toEqual([1, 2, 3, 4, 5, 6])
    expect(appliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6])
    expect(tableNames(db)).toEqual(
      expect.arrayContaining(['matters', 'schema_migrations', 'organisations'])
    )
    const columns = db.exec(`PRAGMA table_info(matters)`)[0].values.map((row) => row[1])
    expect(columns).toContain('status_before_archive')
  })

  it('upgrades an existing v1 database without losing data', async () => {
    const db = await emptyDb()
    db.run(migrations[0].sql)
    db.run(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`
    )
    exec(db, 'INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, ?, ?)', [
      'foundation',
      '2026-08-15T00:00:00.000Z'
    ])

    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    organisations.addAlias(db, org.id, 'eMPF')
    const contact = contacts.createContact(db, { name: 'Alex Chan', organisationId: org.id })
    const waiting = matters.createMatter(db, {
      title: 'EMPF Subsidy Application',
      organisationId: org.id,
      reference: 'EMPF-2026-00123',
      status: 'waiting',
      tagNames: ['HR']
    })
    matters.linkMatterContact(db, { matterId: waiting.id, contactId: contact.id, role: 'Case Officer' })
    exec(db, `UPDATE matters SET status = 'archived', archived_at = ? WHERE id = ?`, [
      '2026-08-15T01:00:00.000Z',
      waiting.id
    ])

    const completed = matters.createMatter(db, {
      title: 'Old completed archive',
      organisationId: org.id,
      status: 'completed'
    })
    exec(db, `UPDATE matters SET status = 'archived', archived_at = ? WHERE id = ?`, [
      '2026-08-15T01:00:00.000Z',
      completed.id
    ])

    expect(appliedVersions(db)).toEqual([1])

    const ran = migrate(db)
    expect(ran).toEqual([2, 3, 4, 5, 6])

    const kept = matters.getMatter(db, waiting.id)
    expect(kept.title).toBe('EMPF Subsidy Application')
    expect(kept.reference).toBe('EMPF-2026-00123')
    expect(kept.organisationName).toBe('eMPF Platform Company Limited')
    expect(kept.tags.map((tag) => tag.name)).toEqual(['HR'])
    expect(kept.contacts).toEqual([
      expect.objectContaining({ name: 'Alex Chan', role: 'Case Officer' })
    ])

    const waitingRow = get<{ status_before_archive: string | null }>(
      db,
      'SELECT status_before_archive FROM matters WHERE id = ?',
      [waiting.id]
    )
    expect(waitingRow?.status_before_archive).toBe('in_progress')

    const completedRow = get<{ status_before_archive: string | null }>(
      db,
      'SELECT status_before_archive FROM matters WHERE id = ?',
      [completed.id]
    )
    expect(completedRow?.status_before_archive).toBe('completed')
  })
})
