import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import type { MatterStatus } from '@shared/types'
import { migrate } from './migrate'
import { get } from './sql'
import * as matters from './matters'
import type { MatterRow } from './mappers'

async function memoryDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

const statuses: Array<Exclude<MatterStatus, 'archived'>> = [
  'new',
  'in_progress',
  'waiting',
  'scheduled',
  'completed'
]

describe('archive / restore lifecycle', () => {
  it.each(statuses)('restores %s after archive', async (status) => {
    const db = await memoryDb()
    const created = matters.createMatter(db, { title: `${status} matter`, status })
    const archived = matters.archiveMatter(db, created.id)

    expect(archived.status).toBe('archived')
    expect(archived.archivedAt).toBeTruthy()
    if (status === 'completed') {
      expect(archived.completedAt).toBeTruthy()
    } else {
      expect(archived.completedAt).toBeNull()
    }

    const row = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [created.id])
    expect(row?.status_before_archive).toBe(status)

    const restored = matters.restoreMatter(db, created.id)
    expect(restored.status).toBe(status)
    expect(restored.archivedAt).toBeNull()
    if (status === 'completed') {
      expect(restored.completedAt).toBeTruthy()
    } else {
      expect(restored.completedAt).toBeNull()
    }

    const after = get<MatterRow>(db, 'SELECT * FROM matters WHERE id = ?', [created.id])
    expect(after?.status_before_archive).toBeNull()
  })
})
