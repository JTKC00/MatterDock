import type { Database, QueryExecResult, SqlValue, Statement } from 'sql.js'

export function exec(db: Database, sql: string, params: SqlValue[] = []): void {
  db.run(sql, params)
}

export function all<T>(db: Database, sql: string, params: SqlValue[] = []): T[] {
  const statement = db.prepare(sql)
  try {
    statement.bind(params)
    const rows: T[] = []
    while (statement.step()) {
      rows.push(statement.getAsObject() as T)
    }
    return rows
  } finally {
    statement.free()
  }
}

export function get<T>(db: Database, sql: string, params: SqlValue[] = []): T | undefined {
  return all<T>(db, sql, params)[0]
}

export function query(db: Database, sql: string, params: SqlValue[] = []): QueryExecResult[] {
  return db.exec(sql, params)
}

export function withTransaction<T>(db: Database, fn: () => T): T {
  exec(db, 'BEGIN IMMEDIATE')
  try {
    const result = fn()
    exec(db, 'COMMIT')
    return result
  } catch (error) {
    exec(db, 'ROLLBACK')
    throw error
  }
}

export function tableNames(db: Database): string[] {
  return all<{ name: string }>(
    db,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  ).map((row) => row.name)
}

export type BoundStatement = Statement
