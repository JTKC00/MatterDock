import type { Database } from 'sql.js'
import { migrations } from './migrations'
import { all, exec } from './sql'

export function ensureMigrationsTable(db: Database): void {
  exec(
    db,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`
  )
}

export function appliedVersions(db: Database): number[] {
  ensureMigrationsTable(db)
  return all<{ version: number }>(db, 'SELECT version FROM schema_migrations ORDER BY version').map(
    (row) => row.version
  )
}

export function latestMigrationVersion(): number {
  return migrations.reduce((max, migration) => Math.max(max, migration.version), 0)
}

export function appliedSchemaVersion(db: Database): number {
  const versions = appliedVersions(db)
  return versions.length === 0 ? 0 : Math.max(...versions)
}

export function databaseSchemaNewerThanApp(db: Database): boolean {
  const latest = latestMigrationVersion()
  const known = new Set(migrations.map((migration) => migration.version))
  for (const version of appliedVersions(db)) {
    if (version > latest || !known.has(version)) return true
  }
  return false
}

export function migrate(db: Database, now = () => new Date().toISOString()): number[] {
  const applied = new Set(appliedVersions(db))
  const ran: number[] = []

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    exec(db, 'BEGIN IMMEDIATE')
    try {
      db.run(migration.sql)
      exec(db, 'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        now()
      ])
      exec(db, 'COMMIT')
      ran.push(migration.version)
    } catch (error) {
      exec(db, 'ROLLBACK')
      throw error
    }
  }

  return ran
}
