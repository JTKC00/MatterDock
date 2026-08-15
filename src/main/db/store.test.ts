import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from './migrate'
import { tableNames } from './sql'
import * as organisations from './organisations'
import * as contacts from './contacts'
import * as matters from './matters'
import { persistDatabase } from './open'

const tempDirs: string[] = []

async function memoryDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

describe('migrations', () => {
  it('creates versioned foundation tables once', async () => {
    const db = await memoryDb()
    const first = migrate(db)
    expect(first).toEqual([])
    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        'schema_migrations',
        'matters',
        'organisations',
        'organisation_aliases',
        'contacts',
        'matter_contacts',
        'tags',
        'matter_tags'
      ])
    )
    expect(tableNames(db)).not.toContain('cases')
  })
})

describe('matter core persistence', () => {
  beforeEach(() => {
    process.env.MATTERDOCK_DISABLE_SEED = '1'
  })

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates organisations, aliases, contacts, matters, tags and relationships', async () => {
    const db = await memoryDb()
    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    organisations.addAlias(db, org.id, 'eMPF')
    organisations.addAlias(db, org.id, '積金易')

    expect(() => organisations.addAlias(db, org.id, 'empf')).toThrow(/already has that alias/)
    expect(() => organisations.addAlias(db, org.id, '   ')).toThrow(/alias/i)

    const contact = contacts.createContact(db, {
      name: 'Alex Chan',
      organisationId: org.id,
      email: 'alex@example.com',
      jobTitle: 'Case Officer'
    })

    const matter = matters.createMatter(db, {
      title: 'EMPF Subsidy Application',
      organisationId: org.id,
      reference: 'EMPF-2026-00123',
      status: 'waiting',
      tagNames: ['HR', 'Government', 'hr']
    })

    expect(matter.status).toBe('waiting')
    expect(matter.reference).toBe('EMPF-2026-00123')
    expect(matter.organisationName).toBe('eMPF Platform Company Limited')
    expect(matter.tags.map((tag) => tag.name)).toEqual(['Government', 'HR'])

    matters.linkMatterContact(db, {
      matterId: matter.id,
      contactId: contact.id,
      role: 'Case Officer'
    })

    const archived = matters.archiveMatter(db, matter.id)
    expect(archived.status).toBe('archived')
    expect(archived.archivedAt).toBeTruthy()
    expect(matters.listMatters(db, { status: 'active' })).toHaveLength(0)
    expect(matters.listMatters(db, { status: 'archived' })).toHaveLength(1)

    const restored = matters.restoreMatter(db, matter.id)
    expect(restored.status).toBe('waiting')

    const dir = mkdtempSync(join(tmpdir(), 'matterdock-'))
    tempDirs.push(dir)
    const filePath = join(dir, 'matterdock.sqlite')
    persistDatabase(db, filePath)
    db.close()

    const SQL = await initSqlJs()
    const reopened = new SQL.Database(readFileSync(filePath))
    reopened.run('PRAGMA foreign_keys = ON')
    const loaded = matters.getMatter(reopened, matter.id)
    expect(loaded.title).toBe('EMPF Subsidy Application')
    expect(loaded.reference).toBe('EMPF-2026-00123')
    expect(loaded.organisationName).toBe('eMPF Platform Company Limited')
    expect(loaded.contacts).toEqual([
      expect.objectContaining({
        contactId: contact.id,
        name: 'Alex Chan',
        role: 'Case Officer'
      })
    ])
    expect(loaded.tags.map((tag) => tag.name)).toEqual(['Government', 'HR'])
    reopened.close()
  })

  it('refuses to delete organisations or contacts that are still linked', async () => {
    const db = await memoryDb()
    const org = organisations.createOrganisation(db, { name: 'Lands Department' })
    const contact = contacts.createContact(db, { name: '羅小姐', organisationId: org.id })
    const matter = matters.createMatter(db, {
      title: 'H28/51-52 Land Resumption',
      organisationId: org.id
    })
    matters.linkMatterContact(db, { matterId: matter.id, contactId: contact.id, role: 'Case Officer' })

    expect(() => organisations.removeOrganisation(db, org.id)).toThrow(/linked to existing matters/)
    expect(() => contacts.removeContact(db, contact.id)).toThrow(/linked to existing matters/)

    matters.unlinkMatterContact(db, matter.id, contact.id)
    contacts.removeContact(db, contact.id)
    expect(matters.getMatter(db, matter.id).contacts).toEqual([])
  })

  it('creates an organisation inline when a matter is saved with a new name', async () => {
    const db = await memoryDb()
    const matter = matters.createMatter(db, {
      title: 'Meter dispute',
      organisationName: 'CLP Power Hong Kong Limited'
    })
    expect(matter.organisationName).toBe('CLP Power Hong Kong Limited')
    expect(organisations.listOrganisations(db)).toHaveLength(1)
  })

  it('preserves multiline organisation, contact and matter notes', async () => {
    const db = await memoryDb()
    const notes = 'Line one\n\nLine two\n- A\n- B'
    const org = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited', notes })
    const contact = contacts.createContact(db, { name: 'Ms Chan', notes })
    const matter = matters.createMatter(db, { title: 'EMPF Subsidy Application' })
    const updated = matters.updateMatter(db, matter.id, { description: notes })
    expect(org.notes).toBe(notes)
    expect(contact.notes).toBe(notes)
    expect(updated.description).toBe(notes)
    expect(organisations.getOrganisation(db, org.id).notes).toBe(notes)
    expect(contacts.getContact(db, contact.id).notes).toBe(notes)
  })
})
