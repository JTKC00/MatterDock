import type { Database } from 'sql.js'
import { get } from './sql'
import { createMatter } from './matters'
import { addAlias, createOrganisation } from './organisations'

export type SeedOptions = {
  packaged?: boolean
}

export function shouldSeed(options?: SeedOptions): boolean {
  if (options?.packaged) return false
  if (process.env.MATTERDOCK_DISABLE_SEED === '1') return false
  if (process.env.MATTERDOCK_SEED === '1') return true
  return process.env.NODE_ENV === 'development'
}

export function seedIfEmpty(db: Database, options?: SeedOptions): boolean {
  if (!shouldSeed(options)) return false
  const existing = get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM matters')
  if ((existing?.count ?? 0) > 0) return false

  const empf = createOrganisation(db, { name: 'eMPF Platform Company Limited' })
  const lands = createOrganisation(db, { name: 'Lands Department' })
  addAlias(db, lands.id, '地政總署')

  createMatter(db, {
    title: 'EMPF Subsidy Application',
    organisationId: empf.id,
    reference: 'EMPF-2026-00123',
    status: 'waiting',
    tagNames: ['HR', 'Government']
  })

  createMatter(db, {
    title: 'H28/51-52 Land Resumption',
    organisationId: lands.id,
    status: 'in_progress',
    tagNames: ['Government', 'Property']
  })

  return true
}
