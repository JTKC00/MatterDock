import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { appliedVersions, migrate } from './migrate'
import { migrations } from './migrations'
import { get, tableNames } from './sql'
import * as matters from './matters'
import * as organisations from './organisations'

async function emptyDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  return db
}

describe('migration v3', () => {
  it('upgrades a 0.1.1 database without losing foundation data', async () => {
    const db = await emptyDb()
    db.run(migrations[0].sql)
    db.run(migrations[1].sql)
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

    const org = organisations.createOrganisation(db, { name: 'CLP Power Hong Kong Limited' })
    organisations.addAlias(db, org.id, '中電')
    const matter = matters.createMatter(db, {
      title: 'Electricity Account Termination',
      organisationId: org.id,
      tagNames: ['Property']
    })

    expect(appliedVersions(db)).toEqual([1, 2])
    const ran = migrate(db)
    expect(ran).toEqual([3, 4, 5, 6])
    expect(tableNames(db)).toEqual(expect.arrayContaining(['events', 'event_email_details']))

    const kept = matters.getMatter(db, matter.id)
    expect(kept.title).toBe('Electricity Account Termination')
    expect(kept.organisationName).toBe('CLP Power Hong Kong Limited')
    expect(kept.tags.map((tag) => tag.name)).toEqual(['Property'])
    expect(get(db, 'SELECT alias FROM organisation_aliases WHERE alias = ?', ['中電'])).toBeTruthy()
    expect(matters.listMatters(db, { search: '中電' }).map((item) => item.id)).toContain(matter.id)
  })
})
