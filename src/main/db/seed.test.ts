import { afterEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from './migrate'
import { seedIfEmpty, shouldSeed } from './seed'

const originalEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  seed: process.env.MATTERDOCK_SEED,
  disableSeed: process.env.MATTERDOCK_DISABLE_SEED
}

afterEach(() => {
  if (originalEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalEnvironment.nodeEnv
  if (originalEnvironment.seed === undefined) delete process.env.MATTERDOCK_SEED
  else process.env.MATTERDOCK_SEED = originalEnvironment.seed
  if (originalEnvironment.disableSeed === undefined) delete process.env.MATTERDOCK_DISABLE_SEED
  else process.env.MATTERDOCK_DISABLE_SEED = originalEnvironment.disableSeed
})

describe('development seed boundary', () => {
  it('always disables demo seeding for packaged applications, even when forced by environment', async () => {
    process.env.NODE_ENV = 'development'
    process.env.MATTERDOCK_SEED = '1'
    delete process.env.MATTERDOCK_DISABLE_SEED

    expect(shouldSeed({ packaged: true })).toBe(false)

    const SQL = await initSqlJs()
    const db = new SQL.Database()
    migrate(db)
    expect(seedIfEmpty(db, { packaged: true })).toBe(false)
    expect(db.exec('SELECT COUNT(*) FROM matters')[0].values[0][0]).toBe(0)
    db.close()
  })
})
