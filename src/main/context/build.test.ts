import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { defaultContextOptions, optionsForPreset } from '@shared/contextOptions'
import type { ContextOptions } from '@shared/types'
import * as contacts from '../db/contacts'
import * as documents from '../db/documents'
import * as events from '../db/events'
import * as matters from '../db/matters'
import { migrate } from '../db/migrate'
import * as organisations from '../db/organisations'
import * as tasks from '../db/tasks'
import { buildMatterContext } from './build'

const tempDirs: string[] = []

async function memoryDb() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'matterdock-context-'))
  tempDirs.push(dir)
  return dir
}

const now = new Date(2026, 7, 15, 12, 0, 0)

function daysAgo(days: number): string {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

const SENSITIVE_PATH = 'C:\\Users\\James\\Documents\\HR\\subsidy-confirmation.pdf'

async function seedMatter() {
  const db = await memoryDb()
  const documentsRoot = tempDir()
  const org = organisations.createOrganisation(db, {
    name: 'CLP Power Hong Kong Limited',
    notes: 'Utility. Also known as CLP / 中電.'
  })
  organisations.addAlias(db, org.id, 'CLP')
  organisations.addAlias(db, org.id, '中電')
  organisations.addAlias(db, org.id, '中華電力')

  const chan = contacts.createContact(db, {
    name: 'Ms Chan',
    organisationId: org.id,
    jobTitle: 'Case Officer',
    email: 'chan@example.com',
    phone: '9123 4567',
    notes: 'Reached at chan@example.com or 9123 4567.'
  })
  const wong = contacts.createContact(db, {
    name: 'Mr Wong',
    organisationId: org.id,
    email: 'wong@example.com',
    phone: '+852 5555 1212'
  })
  contacts.createContact(db, { name: 'Unlinked Stranger', email: 'stranger@example.com' })

  const matter = matters.createMatter(db, {
    title: 'EMPF Subsidy Application',
    organisationId: org.id,
    reference: 'EMPF-2026-00123',
    status: 'in_progress',
    tagNames: ['HR', 'Government']
  })
  matters.updateMatter(db, matter.id, {
    description:
      'Spoke to Ms Chan at chan@example.com about CLP and 中電 and Project Phoenix. Phone 9123 4567. Ref EMPF-2026-00123. Do not match CLPXYZ.'
  })
  matters.linkMatterContact(db, { matterId: matter.id, contactId: chan.id, role: 'Case Officer' })
  matters.linkMatterContact(db, { matterId: matter.id, contactId: wong.id, role: 'Colleague' })

  tasks.createAction(db, {
    matterId: matter.id,
    title: 'Send supporting documents',
    notes: 'Include the pack for Ms Chan.',
    setAsNextAction: true
  })
  const closed = tasks.createAction(db, {
    matterId: matter.id,
    title: 'Filed old pack',
    notes: 'Completed earlier.'
  })
  tasks.completeAction(db, closed.id)
  tasks.createWaiting(db, {
    matterId: matter.id,
    title: 'Confirmation of subsidy amount',
    waitingForContactId: chan.id,
    dueAt: '2026-08-18T00:00:00.000Z'
  })

  events.createEvent(db, {
    matterId: matter.id,
    type: 'note',
    body: 'Old note from 120 days ago about Project Phoenix.',
    occurredAt: daysAgo(120)
  })
  events.createEvent(db, {
    matterId: matter.id,
    type: 'phone',
    direction: 'outgoing',
    contactId: chan.id,
    body: 'Called Ms Chan 60 days ago.',
    occurredAt: daysAgo(60)
  })
  events.createEvent(db, {
    matterId: matter.id,
    type: 'email',
    direction: 'incoming',
    contactId: chan.id,
    occurredAt: daysAgo(10),
    body: 'Please provide documents to chan@example.com or 9123 4567.',
    email: {
      subject: 'Request for supporting documents',
      fromAddress: 'chan@example.com',
      toAddresses: null,
      ccAddresses: null
    }
  })

  const existing = join(documentsRoot, 'available.pdf')
  writeFileSync(existing, 'BYTES')
  documents.insertDocument(db, {
    matterId: matter.id,
    displayName: 'subsidy-confirmation.pdf',
    storageMode: 'reference',
    originalPath: SENSITIVE_PATH,
    managedPath: null,
    fileExtension: 'pdf',
    mimeType: 'application/pdf',
    fileSize: 1200,
    notes: `Original at ${SENSITIVE_PATH}`
  })
  documents.insertDocument(db, {
    matterId: matter.id,
    displayName: 'missing-letter.pdf',
    storageMode: 'reference',
    originalPath: join(documentsRoot, 'does-not-exist.pdf'),
    managedPath: null,
    fileExtension: 'pdf',
    mimeType: 'application/pdf',
    fileSize: 80,
    notes: null
  })

  return { db, documentsRoot, matter, org, chan, wong }
}

function build(db: Awaited<ReturnType<typeof seedMatter>>['db'], matterId: string, documentsRoot: string, options: Partial<ContextOptions> = {}) {
  return buildMatterContext(db, matterId, { ...defaultContextOptions, ...options }, documentsRoot, now)
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('context builder', () => {
  it('assembles every expected full-context section', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot)
    expect(result.content).toContain('# EMPF Subsidy Application')
    expect(result.content).toContain('## Matter')
    expect(result.content).toContain('Reference: EMPF-2026-00123')
    expect(result.content).toContain('## Organisation')
    expect(result.content).toContain('CLP Power Hong Kong Limited')
    expect(result.content).toContain('CLP')
    expect(result.content).toContain('中電')
    expect(result.content).toContain('中華電力')
    expect(result.content).toContain('## Contacts')
    expect(result.content).toContain('### Ms Chan')
    expect(result.content).toContain('### Mr Wong')
    expect(result.content).not.toContain('Unlinked Stranger')
    expect(result.content).toContain('## Next Action')
    expect(result.content).toContain('Send supporting documents')
    expect(result.content).toContain('## Open Actions')
    expect(result.content).toContain('## Waiting')
    expect(result.content).toContain('Confirmation of subsidy amount')
    expect(result.content).toContain('## Timeline')
    expect(result.content).toContain('Request for supporting documents')
    expect(result.content).toContain('## Documents')
    expect(result.content).toContain('subsidy-confirmation.pdf')
    expect(result.content).toContain('Reference original')
    expect(result.content).not.toContain('Filed old pack')
    expect(result.content).not.toContain(SENSITIVE_PATH)
    expect(result.content).not.toContain(matter.id)
    expect(result.content).not.toMatch(/Organisation:\s*null/)
    expect(result.suggestedName).toBe('EMPF Subsidy Application-context.md')
  })

  it('omits timeline and documents when those scopes are off', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const withoutTimeline = build(db, matter.id, documentsRoot, { includeTimeline: false })
    expect(withoutTimeline.content).not.toContain('## Timeline')
    expect(withoutTimeline.content).not.toContain('Request for supporting documents')
    expect(withoutTimeline.content).not.toContain('Old note from 120 days ago')

    const withoutDocs = build(db, matter.id, documentsRoot, { includeDocuments: false })
    expect(withoutDocs.content).not.toContain('## Documents')
    expect(withoutDocs.content).not.toContain('subsidy-confirmation.pdf')
  })

  it('includes closed work only when requested', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const included = build(db, matter.id, documentsRoot, { includeClosedWork: true })
    expect(included.content).toContain('Filed old pack')
    expect(included.content).toContain('## Completed / cancelled')
  })

  it('filters timeline by last 30 and 90 days against a fixed clock', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const all = build(db, matter.id, documentsRoot, { timelineRange: 'all' })
    expect(all.content).toContain('Old note from 120 days ago')
    expect(all.content).toContain('Called Ms Chan 60 days ago')
    expect(all.content).toContain('Request for supporting documents')
    expect(all.content.indexOf('Old note from 120 days ago')).toBeLessThan(all.content.indexOf('Called Ms Chan 60 days ago'))
    expect(all.content.indexOf('Called Ms Chan 60 days ago')).toBeLessThan(all.content.indexOf('Request for supporting documents'))

    const thirty = build(db, matter.id, documentsRoot, { timelineRange: '30d' })
    expect(thirty.content).not.toContain('Old note from 120 days ago')
    expect(thirty.content).not.toContain('Called Ms Chan 60 days ago')
    expect(thirty.content).toContain('Request for supporting documents')

    const ninety = build(db, matter.id, documentsRoot, { timelineRange: '90d' })
    expect(ninety.content).not.toContain('Old note from 120 days ago')
    expect(ninety.content).toContain('Called Ms Chan 60 days ago')
    expect(ninety.content).toContain('Request for supporting documents')
  })

  it('replaces the same contact name with one stable label everywhere', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot, { redactContactNames: true })
    expect(result.content).not.toContain('Ms Chan')
    expect(result.content).not.toContain('Mr Wong')
    expect(result.content).toContain('[Contact 1]')
    expect(result.content).toContain('[Contact 2]')
    const waiting = result.content.match(/Waiting for \[Contact (\d+)\]/)
    const spoke = result.content.match(/Spoke to \[Contact (\d+)\]/)
    expect(waiting?.[1]).toBeTruthy()
    expect(waiting?.[1]).toBe(spoke?.[1])
    expect(result.content).toMatch(/Called \[Contact \d+\] 60 days ago/)
  })

  it('redacts organisation names and aliases in structured fields and free text', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot, { redactOrganisationNames: true })
    expect(result.content).not.toContain('CLP Power Hong Kong Limited')
    expect(result.content).not.toMatch(/(?<![A-Za-z0-9])CLP(?![A-Za-z0-9])/)
    expect(result.content).not.toContain('中電')
    expect(result.content).not.toContain('中華電力')
    expect(result.content).toContain('[Organisation 1]')
    expect(result.content).toContain('CLPXYZ')
  })

  it('uses one email label for the same address in the contact and in free text', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot, { redactEmails: true })
    expect(result.content.toLowerCase()).not.toContain('chan@example.com')
    const structured = result.content.match(/### Ms Chan[\s\S]*?Email: (\[Email \d+\])/)
    const free = result.content.match(/Spoke to Ms Chan at (\[Email \d+\])/)
    expect(structured?.[1]).toBeTruthy()
    expect(structured?.[1]).toBe(free?.[1])
    expect(result.content).toContain(`documents to ${structured?.[1]}`)
  })

  it('redacts known contact phone numbers in structured fields and free text', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot, { redactPhones: true })
    expect(result.content).not.toContain('9123 4567')
    expect(result.content).toContain('[Phone 1]')
  })

  it('redacts the matter reference in structured fields and free text', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot, { redactReference: true })
    expect(result.content).not.toContain('EMPF-2026-00123')
    expect(result.content).toContain('[Matter Reference]')
    expect(result.content).toContain('Reference: [Matter Reference]')
  })

  it('replaces custom redaction values with [Redacted]', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot, {
      customRedactions: ['', 'Project Phoenix', 'Project Phoenix', '  ']
    })
    expect(result.content).not.toContain('Project Phoenix')
    expect(result.content).toContain('[Redacted]')
  })

  it('does not mutate source records when building a redacted export', async () => {
    const { db, documentsRoot, matter, org, chan } = await seedMatter()
    build(db, matter.id, documentsRoot, {
      ...optionsForPreset('privacy_safe'),
      customRedactions: ['Project Phoenix']
    })
    const loadedMatter = matters.getMatter(db, matter.id)
    const loadedOrg = organisations.getOrganisation(db, org.id)
    const loadedChan = contacts.getContact(db, chan.id)
    expect(loadedMatter.reference).toBe('EMPF-2026-00123')
    expect(loadedMatter.description).toContain('Ms Chan')
    expect(loadedOrg.name).toBe('CLP Power Hong Kong Limited')
    expect(loadedOrg.aliases.map((alias) => alias.alias)).toEqual(expect.arrayContaining(['CLP', '中電', '中華電力']))
    expect(loadedChan.name).toBe('Ms Chan')
    expect(loadedChan.email).toBe('chan@example.com')
    expect(loadedChan.phone).toBe('9123 4567')
    expect(loadedChan.notes).toContain('chan@example.com')
  })

  it('can include a local path only when include is on and hide is off', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const shown = build(db, matter.id, documentsRoot, { includeFilePaths: true, hideFilePaths: false })
    expect(shown.content).toContain(SENSITIVE_PATH)

    const hidden = build(db, matter.id, documentsRoot, { includeFilePaths: true, hideFilePaths: true })
    expect(hidden.content).not.toContain(SENSITIVE_PATH)
    expect(hidden.content).toContain('[Local Path]')
  })

  it('still exports metadata when a referenced file is missing', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot)
    expect(result.content).toContain('missing-letter.pdf')
    expect(result.content).toContain('File unavailable')
  })

  it('renders deterministic markdown and json for the same clock and options', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const first = build(db, matter.id, documentsRoot)
    const second = build(db, matter.id, documentsRoot)
    expect(first.content).toBe(second.content)
    expect(first.generatedAt).toBe(now.toISOString())

    const jsonA = build(db, matter.id, documentsRoot, { format: 'json' })
    const jsonB = build(db, matter.id, documentsRoot, { format: 'json' })
    expect(jsonA.content).toBe(jsonB.content)
    const parsed = JSON.parse(jsonA.content) as { schemaVersion: number; generatedAt: string; matter: { title: string } }
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.generatedAt).toBe(now.toISOString())
    expect(parsed.matter.title).toBe('EMPF Subsidy Application')
    expect(jsonA.suggestedName).toBe('EMPF Subsidy Application-context.json')
  })

  it('renders plain text without markdown headings', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const result = build(db, matter.id, documentsRoot, { format: 'text' })
    expect(result.content).toContain('EMPF Subsidy Application')
    expect(result.content).not.toMatch(/^# /m)
    expect(result.suggestedName).toBe('EMPF Subsidy Application-context.txt')
  })

  it('applies current-work and privacy-safe presets', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const current = build(db, matter.id, documentsRoot, optionsForPreset('current_work'))
    expect(current.content).toContain('Send supporting documents')
    expect(current.content).not.toContain('## Timeline')
    expect(current.content).not.toMatch(/Email: chan@example.com/)
    expect(current.content).not.toMatch(/Phone: 9123 4567/)

    const privateExport = build(db, matter.id, documentsRoot, optionsForPreset('privacy_safe'))
    expect(privateExport.content).not.toContain('Ms Chan')
    expect(privateExport.content).not.toContain('chan@example.com')
    expect(privateExport.content).not.toContain('9123 4567')
    expect(privateExport.content).not.toContain('EMPF-2026-00123')
    expect(privateExport.content).not.toContain(SENSITIVE_PATH)
    expect(privateExport.content).toContain('[Contact 1]')
    expect(privateExport.content).toContain('[Email 1]')
    expect(privateExport.content).toContain('[Matter Reference]')
  })

  it('sanitises the suggested filename and still works for archived matters', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    matters.updateMatter(db, matter.id, { title: 'A/B: C*D' })
    matters.archiveMatter(db, matter.id)
    const result = build(db, matter.id, documentsRoot)
    expect(result.suggestedName).toBe('A B C D-context.md')
    expect(result.content).toContain('# A/B: C*D')
    expect(result.content).toContain('Status: Archived')
  })

  it('writes the same preview bytes that a caller would save', async () => {
    const { db, documentsRoot, matter } = await seedMatter()
    const exported = build(db, matter.id, documentsRoot, { format: 'markdown' })
    const dest = join(tempDir(), exported.suggestedName)
    writeFileSync(dest, exported.content, 'utf8')
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(dest, 'utf8')).toBe(exported.content)
    expect(exported.characterCount).toBe(exported.content.length)
  })
})
