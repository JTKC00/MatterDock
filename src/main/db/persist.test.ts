import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { USER_ERRORS } from '@shared/errors'
import { persistDatabase } from './open'
import { DatabaseStore } from './store'
import * as matters from './matters'

const tempDirs: string[] = []

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'matterdock-persist-'))
  tempDirs.push(dir)
  return join(dir, 'matterdock.sqlite')
}

describe('durable persistence', () => {
  beforeEach(() => {
    process.env.MATTERDOCK_DISABLE_SEED = '1'
  })

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('persists a successful mutation before returning', async () => {
    const filePath = tempFile()
    const store = new DatabaseStore(filePath)
    await store.initialize()

    const created = store.mutate((db) => matters.createMatter(db, { title: 'Saved to disk' }))
    expect(existsSync(filePath)).toBe(true)

    const SQL = await initSqlJs()
    const reopened = new SQL.Database(readFileSync(filePath))
    const rows = reopened.exec('SELECT title FROM matters')
    expect(rows[0].values[0][0]).toBe('Saved to disk')
    reopened.close()
    expect(created.title).toBe('Saved to disk')
    await store.close()
  })

  it('treats disk persist failure as a failed mutation and keeps memory consistent', async () => {
    const filePath = tempFile()
    let failNext = false
    const store = new DatabaseStore(filePath, (db, path) => {
      if (failNext) {
        failNext = false
        throw new Error('simulated disk failure')
      }
      persistDatabase(db, path)
    })
    await store.initialize()

    failNext = true
    expect(() => store.mutate((db) => matters.createMatter(db, { title: 'Should roll back' }))).toThrow(
      USER_ERRORS.persistFailed
    )

    expect(store.query((db) => matters.listMatters(db))).toHaveLength(0)

    const SQL = await initSqlJs()
    const disk = new SQL.Database(readFileSync(filePath))
    const count = disk.exec('SELECT COUNT(*) FROM matters')[0].values[0][0]
    expect(count).toBe(0)
    disk.close()

    const created = store.mutate((db) => matters.createMatter(db, { title: 'Retry works' }))
    expect(created.title).toBe('Retry works')
    expect(store.query((db) => matters.listMatters(db))).toHaveLength(1)
    await store.close()
  })

  it('keeps the last mutation when writes happen in sequence', async () => {
    const filePath = tempFile()
    const store = new DatabaseStore(filePath)
    await store.initialize()

    const first = store.mutate((db) => matters.createMatter(db, { title: 'One' }))
    store.mutate((db) => matters.updateMatter(db, first.id, { title: 'Two' }))
    store.mutate((db) => matters.updateMatter(db, first.id, { title: 'Three' }))

    const SQL = await initSqlJs()
    const disk = new SQL.Database(readFileSync(filePath))
    const title = disk.exec('SELECT title FROM matters WHERE id = ?', [first.id])[0].values[0][0]
    expect(title).toBe('Three')
    disk.close()
    await store.close()
  })
})
