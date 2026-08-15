import { join } from 'node:path'
import type { Database } from 'sql.js'
import { AppError, USER_ERRORS, toUserError } from '@shared/errors'
import { migrate } from './migrate'
import { persistDatabase, openDatabase } from './open'
import { seedIfEmpty } from './seed'
import * as contacts from './contacts'
import * as matters from './matters'
import * as organisations from './organisations'
import { listTags } from './tags'
import { withTransaction } from './sql'

export class DatabaseStore {
  private db: Database | null = null
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    this.db = await openDatabase(this.filePath)
    migrate(this.db)
    const seeded = seedIfEmpty(this.db)
    if (seeded) this.persistNow()
    else this.persistNow()
  }

  path(): string {
    return this.filePath
  }

  async close(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    await this.writeChain
    if (this.db) {
      this.persistNow()
      this.db.close()
      this.db = null
    }
  }

  mutate<T>(fn: (db: Database) => T): T {
    const db = this.requireDb()
    try {
      const result = withTransaction(db, () => fn(db))
      this.schedulePersist()
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

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.writeChain = this.writeChain.then(() => this.persistNow()).catch((error) => {
        console.error('[matterdock] persist failed', error)
      })
    }, 40)
  }

  private persistNow(): void {
    if (!this.db) return
    persistDatabase(this.db, this.filePath)
  }
}

export function databasePath(userData: string): string {
  return join(userData, 'matterdock.sqlite')
}

export { contacts, matters, organisations, listTags }
