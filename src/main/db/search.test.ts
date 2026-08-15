import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from './migrate'
import * as organisations from './organisations'
import * as matters from './matters'

async function memoryDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

describe('matter search via organisation alias', () => {
  it('finds a matter by organisation aliases', async () => {
    const db = await memoryDb()
    const org = organisations.createOrganisation(db, { name: 'CLP Power Hong Kong Limited' })
    for (const alias of ['中電', 'CLP', '中華電力', 'China Light & Power']) {
      organisations.addAlias(db, org.id, alias)
    }
    const matter = matters.createMatter(db, {
      title: 'Electricity Account Termination',
      organisationId: org.id
    })

    for (const query of ['中電', 'clp', '中華電力', 'China Light']) {
      const found = matters.listMatters(db, { search: query })
      expect(found.map((item) => item.id), query).toContain(matter.id)
    }

    expect(matters.listMatters(db, { search: 'no-such-org' })).toHaveLength(0)
  })
})
