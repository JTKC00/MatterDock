import { join } from 'node:path'
import type { Database, SqlJsStatic } from 'sql.js'
import { AppError, USER_ERRORS, toUserError } from '@shared/errors'
import { migrate } from './migrate'
import { loadSqlJs, persistDatabase, openDatabase } from './open'
import { seedIfEmpty } from './seed'
import * as contacts from './contacts'
import * as matters from './matters'
import * as organisations from './organisations'
import * as events from './events'
import { listTags } from './tags'
import { withTransaction } from './sql'

export type PersistFn = (db: Database, filePath: string) => void

export class DatabaseStore {
  private db: Database | null = null
  private SQL: SqlJsStatic | null = null

  constructor(
    private readonly filePath: string,
    private readonly persistFn: PersistFn = persistDatabase
  ) {}

  async initialize(): Promise<void> {
    this.SQL = await loadSqlJs()
    this.db = await openDatabase(this.filePath)
    migrate(this.db)
    seedIfEmpty(this.db)
    this.persistNow()
  }

  path(): string {
    return this.filePath
  }

  async close(): Promise<void> {
    if (this.db) {
      this.persistNow()
      this.db.close()
      this.db = null
    }
  }

  mutate<T>(fn: (db: Database) => T): T {
    const db = this.requireDb()
    const snapshot = db.export()
    try {
      const result = withTransaction(db, () => fn(db))
      try {
        this.persistNow()
      } catch (persistError) {
        this.restoreSnapshot(snapshot)
        console.error('[matterdock] persist failed', persistError)
        throw new AppError(USER_ERRORS.persistFailed, 'PERSIST_FAILED', { cause: persistError })
      }
      return result
    } catch (error) {
      if (error instanceof AppError) throw error
      console.error('[matterdock] database mutation failed', error)
      throw new AppError(toUserError(error, USER_ERRORS.database), 'DATABASE')
    }
  }

  query<T>(fn: (db: Database) => T): T {
    const db = this.requireDb()
    try {
      return fn(db)
    } catch (error) {
      if (error instanceof AppError) throw error
      console.error('[matterdock] database query failed', error)
      throw new AppError(toUserError(error, USER_ERRORS.database), 'DATABASE')
    }
  }

  private requireDb(): Database {
    if (!this.db) throw new AppError(USER_ERRORS.database, 'DATABASE_CLOSED')
    return this.db
  }

  private persistNow(): void {
    if (!this.db) return
    this.persistFn(this.db, this.filePath)
  }

  private restoreSnapshot(snapshot: Uint8Array): void {
    if (!this.SQL) throw new AppError(USER_ERRORS.database, 'DATABASE_CLOSED')
    this.db?.close()
    this.db = new this.SQL.Database(snapshot)
    this.db.run('PRAGMA foreign_keys = ON')
  }
}

export function databasePath(userData: string): string {
  return join(userData, 'matterdock.sqlite')
}

export { contacts, matters, organisations, events, listTags }
