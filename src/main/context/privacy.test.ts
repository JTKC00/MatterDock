import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { defaultContextOptions } from '@shared/contextOptions'
import type { ContextOptions } from '@shared/types'
import * as contacts from '../db/contacts'
import * as documents from '../db/documents'
import * as events from '../db/events'
import * as matters from '../db/matters'
import { migrate } from '../db/migrate'
import * as organisations from '../db/organisations'
import * as tasks from '../db/tasks'
import { applyScope, buildMatterContext } from './build'
import { loadMatterContextSnapshot } from './load'
import { applyRedactionPlan, buildRedactionPlan } from './redact'

const tempDirs: string[] = []
const now = new Date(2026, 7, 15, 12, 0, 0)
const KNOWN_PATH = 'C:\\Users\\James\\Documents\\HR\\case.pdf'

async function memoryDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'matterdock-privacy-'))
  tempDirs.push(dir)
  return dir
}

function build(
  db: Awaited<ReturnType<typeof memoryDb>>,
  matterId: string,
  documentsRoot: string,
  options: Partial<ContextOptions>
) {
  return buildMatterContext(db, matterId, { ...defaultContextOptions, ...options }, documentsRoot, now)
}

async function seedPrivacyMatter() {
  const db = await memoryDb()
  const documentsRoot = tempDir()
  const org = organisations.createOrganisation(db, { name: 'CLP Power Hong Kong Limited' })
  organisations.addAlias(db, org.id, 'CLP')
  organisations.addAlias(db, org.id, '中電')
  organisations.addAlias(db, org.id, '中華電力')

  const vendor = organisations.createOrganisation(db, { name: 'Vendor B Limited' })
  organisations.addAlias(db, vendor.id, 'Vendor B')

  const chan = contacts.createContact(db, {
    name: 'Ms Chan',
    organisationId: org.id,
    email: 'chan@example.com',
    phone: '9123 4567'
  })
  const wong = contacts.createContact(db, {
    name: 'Mr Wong',
    organisationId: vendor.id,
    email: 'wong@example.com',
    phone: '+852 5555 1212'
  })
  const lee = contacts.createContact(db, {
    name: 'Mrs Lee',
    email: 'lee@example.com'
  })

  const matter = matters.createMatter(db, {
    title: 'EMPF Subsidy Application',
    organisationId: org.id,
    reference: 'EMPF-2026-00123'
  })
  matters.updateMatter(db, matter.id, {
    description: 'Spoke to Ms Chan and CLP / 中電. Call 9123 4567. Email chan@example.com.'
  })
  matters.linkMatterContact(db, { matterId: matter.id, contactId: chan.id, role: 'Case Officer' })
  matters.linkMatterContact(db, { matterId: matter.id, contactId: wong.id, role: 'Vendor' })

  tasks.createAction(db, {
    matterId: matter.id,
    title: 'Send supporting documents',
    notes: 'Send copy to Ms Chan.',
    setAsNextAction: true
  })

  events.createEvent(db, {
    matterId: matter.id,
    type: 'note',
    body: `Called Ms Chan. Email chan@example.com. Call 9123 4567. Case EMPF-2026-00123 updated. Saved at ${KNOWN_PATH}. Do not match CLPXYZ.`,
    occurredAt: '2026-08-10T04:00:00.000Z'
  })
  events.createEvent(db, {
    matterId: matter.id,
    type: 'phone',
    direction: 'outgoing',
    contactId: lee.id,
    body: 'Called Mrs Lee about the application.',
    occurredAt: '2026-08-11T04:00:00.000Z'
  })

  documents.insertDocument(db, {
    matterId: matter.id,
    displayName: 'case.pdf',
    storageMode: 'reference',
    originalPath: KNOWN_PATH,
    managedPath: null,
    fileExtension: 'pdf',
    mimeType: 'application/pdf',
    fileSize: 10,
    notes: null
  })

  return { db, documentsRoot, matter, org, vendor, chan, wong, lee }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('cross-scope privacy inventory', () => {
  it('redacts linked contact names in timeline and description when Contacts is off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeContacts: false,
      includeTimeline: true,
      includeOverview: true,
      redactContactNames: true
    })
    expect(result.content).not.toContain('## Contacts')
    expect(result.content).not.toContain('Ms Chan')
    expect(result.content).toMatch(/\[Contact \d+\]/)
    expect(result.content).toContain('Spoke to [Contact')
    expect(result.content).toContain('Called [Contact')
    expect(result.content).toContain('## Timeline')
  })

  it('redacts contact names in work-item notes when Contacts is off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeContacts: false,
      includeOpenActions: true,
      redactContactNames: true
    })
    expect(result.content).toContain('Send copy to [Contact')
    expect(result.content).not.toContain('Ms Chan')
  })

  it('redacts an unlinked timeline contact', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeContacts: false,
      includeTimeline: true,
      redactContactNames: true
    })
    expect(result.content).not.toContain('Mrs Lee')
    expect(result.content).toMatch(/Called \[Contact \d+\] about the application/)
  })

  it('keeps the same contact label when Contacts is turned off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const both = build(db, matter.id, documentsRoot, {
      includeContacts: true,
      includeTimeline: true,
      redactContactNames: true
    })
    const timelineOnly = build(db, matter.id, documentsRoot, {
      includeContacts: false,
      includeTimeline: true,
      redactContactNames: true
    })
    const fromBoth = both.content.match(/Called (\[Contact \d+\])\./)?.[1]
    const fromTimeline = timelineOnly.content.match(/Called (\[Contact \d+\])\./)?.[1]
    expect(fromBoth).toBeTruthy()
    expect(fromBoth).toBe(fromTimeline)
    expect(timelineOnly.content).not.toContain('## Contacts')
  })

  it('redacts known emails when Contacts is off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeContacts: false,
      includeTimeline: true,
      redactEmails: true
    })
    expect(result.content.toLowerCase()).not.toContain('chan@example.com')
    expect(result.content).toMatch(/\[Email \d+\]/)
    expect(result.content).not.toContain('## Contacts')
  })

  it('redacts known phones when Contacts is off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeContacts: false,
      includeTimeline: true,
      redactPhones: true
    })
    expect(result.content).not.toContain('9123 4567')
    expect(result.content).toMatch(/\[Phone \d+\]/)
  })

  it('keeps email labels stable when Contacts is off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const both = build(db, matter.id, documentsRoot, {
      includeContacts: true,
      includeTimeline: true,
      redactEmails: true
    })
    const timelineOnly = build(db, matter.id, documentsRoot, {
      includeContacts: false,
      includeTimeline: true,
      redactEmails: true
    })
    const fromBoth = both.content.match(/Email (\[Email \d+\])/)?.[1]
    const fromTimeline = timelineOnly.content.match(/Email (\[Email \d+\])/)?.[1]
    expect(fromBoth).toMatch(/\[Email \d+\]/)
    expect(fromBoth).toBe(fromTimeline)
  })

  it('redacts the matter organisation when the Organisation section is off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeOrganisation: false,
      includeOverview: true,
      redactOrganisationNames: true
    })
    expect(result.content).not.toContain('## Organisation')
    expect(result.content).not.toContain('CLP Power Hong Kong Limited')
    expect(result.content).toContain('Organisation: [Organisation 1]')
  })

  it('redacts organisation aliases in free text when the Organisation section is off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeOrganisation: false,
      includeOverview: true,
      redactOrganisationNames: true
    })
    expect(result.content).not.toMatch(/(?<![A-Za-z0-9])CLP(?![A-Za-z0-9])/)
    expect(result.content).not.toContain('中電')
    expect(result.content).toContain('[Organisation 1]')
    expect(result.content).toContain('CLPXYZ')
  })

  it('gives contact organisations their own stable label', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeContacts: true,
      includeOrganisation: true,
      redactOrganisationNames: true
    })
    expect(result.content).not.toContain('CLP Power Hong Kong Limited')
    expect(result.content).not.toContain('Vendor B Limited')
    expect(result.content).toContain('[Organisation 1]')
    expect(result.content).toContain('[Organisation 2]')
    expect(result.content).toMatch(/### Mr Wong[\s\S]*Organisation: \[Organisation 2\]/)
  })

  it('redacts the matter reference outside the overview', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeOverview: false,
      includeTimeline: true,
      redactReference: true
    })
    expect(result.content).not.toContain('## Matter')
    expect(result.content).not.toContain('EMPF-2026-00123')
    expect(result.content).toContain('[Matter Reference]')
  })

  it('redacts known document paths when Documents is off', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeDocuments: false,
      includeTimeline: true,
      hideFilePaths: true
    })
    expect(result.content).not.toContain('## Documents')
    expect(result.content).not.toContain(KNOWN_PATH)
    expect(result.content).toContain('[Local Path]')
  })

  it('still redacts emails from full contact data when contacts are minimal', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      contactsMinimal: true,
      includeTimeline: false,
      redactEmails: true
    })
    expect(result.content).not.toMatch(/Email: /)
    expect(result.content.toLowerCase()).not.toContain('chan@example.com')
    expect(result.content).toMatch(/\[Email \d+\]/)
  })

  it('prefers an explicit custom redaction over the contact label', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const result = build(db, matter.id, documentsRoot, {
      includeContacts: true,
      redactContactNames: true,
      customRedactions: ['Ms Chan']
    })
    expect(result.content).not.toContain('Ms Chan')
    expect(result.content).toContain('[Redacted]')
    expect(result.content).toContain('### [Redacted]')
    expect(result.content).toContain('Send copy to [Redacted].')
  })

  it('does not leak a hidden section and keeps JSON schemaVersion 1', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const json = build(db, matter.id, documentsRoot, {
      includeContacts: false,
      includeTimeline: true,
      redactContactNames: true,
      format: 'json'
    })
    const parsed = JSON.parse(json.content) as {
      schemaVersion: number
      contacts?: unknown
      timeline?: Array<{ body: string | null }>
      privacySources?: unknown
    }
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.contacts).toBeUndefined()
    expect(parsed.privacySources).toBeUndefined()
    expect(parsed.timeline?.some((event) => event.body?.includes('[Contact'))).toBe(true)
    expect(json.content).not.toContain('Ms Chan')
  })

  it('builds one identity map for every scope', async () => {
    const { db, documentsRoot, matter } = await seedPrivacyMatter()
    const loaded = loadMatterContextSnapshot(db, matter.id, documentsRoot, now)
    const options = {
      ...defaultContextOptions,
      redactContactNames: true,
      redactEmails: true,
      redactOrganisationNames: true
    }
    const plan = buildRedactionPlan(loaded, options)
    const withContacts = applyRedactionPlan(applyScope(loaded, options, now), plan, options)
    const withoutContacts = applyRedactionPlan(
      applyScope(loaded, { ...options, includeContacts: false }, now),
      plan,
      options
    )
    expect(withContacts.timeline[0]?.body).toBe(withoutContacts.timeline[0]?.body)
    expect(withoutContacts.contacts).toEqual([])
    expect(loaded.contacts.map((contact) => contact.name)).toEqual(['Mr Wong', 'Ms Chan'])
    expect(loaded.privacySources?.organisations.some((org) => org.name === 'Vendor B Limited')).toBe(true)
  })

  it('does not mutate source records after a privacy-safe export', async () => {
    const { db, documentsRoot, matter, org, chan, lee } = await seedPrivacyMatter()
    build(db, matter.id, documentsRoot, {
      includeContacts: false,
      redactContactNames: true,
      redactEmails: true,
      redactPhones: true,
      redactOrganisationNames: true,
      redactReference: true,
      hideFilePaths: true,
      customRedactions: ['application']
    })
    expect(matters.getMatter(db, matter.id).description).toContain('Ms Chan')
    expect(organisations.getOrganisation(db, org.id).name).toBe('CLP Power Hong Kong Limited')
    expect(contacts.getContact(db, chan.id).email).toBe('chan@example.com')
    expect(contacts.getContact(db, lee.id).name).toBe('Mrs Lee')
    expect(events.listEventsForMatter(db, matter.id).some((event) => event.body?.includes('Ms Chan'))).toBe(true)
    expect(tasks.listItemsForMatter(db, matter.id).some((item) => item.notes?.includes('Ms Chan'))).toBe(true)
    expect(documents.listDocumentsForMatter(db, matter.id)[0]?.originalPath).toBe(KNOWN_PATH)
  })
})
