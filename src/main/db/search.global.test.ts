import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { persistDatabase } from './open'
import { DatabaseStore } from './store'
import * as contacts from './contacts'
import * as events from './events'
import * as matters from './matters'
import * as organisations from './organisations'
import { globalSearch } from './search'
import * as tasks from './tasks'
import { createDocumentService } from '../documents/service'

const dirs: string[] = []

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

async function seeded() {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-search-'))
  dirs.push(userData)
  const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
  await store.initialize()
  const docs = createDocumentService(store, join(userData, 'documents'))
  const data = store.mutate((db) => {
    const org = organisations.createOrganisation(db, { name: 'CLP Power Hong Kong Limited' })
    organisations.addAlias(db, org.id, '中電')
    organisations.addAlias(db, org.id, 'CLP')
    organisations.addAlias(db, org.id, '中華電力')
    organisations.addAlias(db, org.id, 'China Light & Power')
    const empf = organisations.createOrganisation(db, { name: 'eMPF Platform Company Limited' })
    const contact = contacts.createContact(db, { name: 'Ms Chan', organisationId: empf.id })
    const matter = matters.createMatter(db, {
      title: 'EMPF Subsidy Application',
      organisationId: empf.id,
      reference: 'EMPF-2026-00123'
    })
    const archived = matters.createMatter(db, { title: 'Electricity Account Termination', organisationId: org.id })
    matters.archiveMatter(db, archived.id)
    events.createEvent(db, {
      matterId: matter.id,
      type: 'email',
      direction: 'incoming',
      body: 'Please provide the salary supporting documents.',
      email: { subject: 'Request for additional documents', fromAddress: null, toAddresses: null, ccAddresses: null }
    })
    tasks.createWaiting(db, {
      matterId: matter.id,
      title: 'Confirmation of subsidy amount',
      waitingForText: 'Ms Chan'
    })
    return { org, empf, contact, matter, archived }
  })
  const source = join(userData, 'subsidy-confirmation.pdf')
  writeFileSync(source, 'PDF')
  const document = docs.addReference({
    matterId: data.matter.id,
    path: source,
    notes: 'Signed confirmation'
  })
  return { store, docs, document, source, ...data }
}

describe('global search', () => {
  it('finds matters, aliases, contacts, timeline, waiting and documents', async () => {
    const { store, matter, contact, org, document } = await seeded()
    store.query((db) => {
      expect(globalSearch(db, 'EMPF Subsidy').hits.some((hit) => hit.id === matter.id)).toBe(true)
      expect(globalSearch(db, 'EMPF-2026-00123').hits.some((hit) => hit.id === matter.id && hit.type === 'matter')).toBe(true)
      expect(globalSearch(db, '中電').hits.some((hit) => hit.id === org.id && hit.type === 'organisation')).toBe(true)
      expect(globalSearch(db, 'CLP').hits.some((hit) => hit.id === org.id)).toBe(true)
      expect(globalSearch(db, '中華電力').hits.some((hit) => hit.id === org.id)).toBe(true)
      expect(globalSearch(db, 'Ms Chan').hits.some((hit) => hit.id === contact.id && hit.type === 'contact')).toBe(true)
      expect(globalSearch(db, 'supporting documents').hits.some((hit) => hit.type === 'event')).toBe(true)
      expect(globalSearch(db, 'subsidy confirmation').hits.some((hit) => hit.type === 'task' && hit.label === 'Waiting')).toBe(
        true
      )
      expect(globalSearch(db, 'Confirmation.pdf').hits.some((hit) => hit.id === document.id && hit.type === 'document')).toBe(
        true
      )
    })
  })

  it('returns archived matters with an archived label', async () => {
    const { store, archived } = await seeded()
    const hits = store.query((db) => globalSearch(db, 'Electricity Account'))
    const hit = hits.hits.find((item) => item.id === archived.id)
    expect(hit?.archived).toBe(true)
    expect(hit?.label).toBe('Matter')
  })

  it('updates after edit and drops deleted events', async () => {
    const { store, matter } = await seeded()
    store.query((db) => {
      expect(globalSearch(db, 'EMPF Subsidy').hits.some((hit) => hit.id === matter.id)).toBe(true)
    })
    store.mutate((db) => matters.updateMatter(db, matter.id, { title: 'Housing File', reference: 'HS-9' }))
    store.query((db) => {
      expect(globalSearch(db, 'EMPF Subsidy').hits.some((hit) => hit.id === matter.id)).toBe(false)
      expect(globalSearch(db, 'Housing File').hits.some((hit) => hit.id === matter.id)).toBe(true)
    })
    const eventId = store.query((db) => events.listEventsForMatter(db, matter.id)[0].id)
    store.mutate((db) => events.deleteEvent(db, eventId))
    store.query((db) => {
      expect(globalSearch(db, 'supporting documents').hits.some((hit) => hit.type === 'event')).toBe(false)
    })
  })

  it('still finds a document after the original file is missing', async () => {
    const { store, docs, document, source } = await seeded()
    rmSync(source)
    const listed = docs.listForMatter(document.matterId)[0]
    expect(listed.available).toBe(false)
    store.query((db) => {
      const hit = globalSearch(db, 'subsidy-confirmation').hits.find((item) => item.id === document.id)
      expect(hit).toBeTruthy()
      expect(hit?.fileUnavailable).toBe(true)
    })
  })

  it('does not search an empty query', async () => {
    const { store } = await seeded()
    store.query((db) => {
      expect(globalSearch(db, '   ').hits).toHaveLength(0)
    })
  })

  it('surfaces related matters from organisation aliases', async () => {
    const { store, org, archived } = await seeded()
    store.query((db) => {
      for (const query of ['中電', 'CLP', '中華電力', 'China Light & Power']) {
        const result = globalSearch(db, query)
        expect(result.hits.some((hit) => hit.id === org.id && hit.type === 'organisation'), query).toBe(true)
        const matterHit = result.hits.find((hit) => hit.id === archived.id && hit.type === 'matter')
        expect(matterHit, query).toBeTruthy()
        expect(matterHit?.archived).toBe(true)
        expect(matterHit?.subtitle).toContain('CLP Power Hong Kong Limited')
      }
    })
  })

  it('drops a document from search after remove and updates after relink', async () => {
    const { store, docs, document, source } = await seeded()
    store.query((db) => {
      expect(globalSearch(db, 'subsidy-confirmation').hits.some((hit) => hit.id === document.id)).toBe(true)
    })
    const next = join(source, '..', 'new-file.pdf')
    writeFileSync(next, 'NEW')
    docs.relink(document.id, { path: next })
    store.query((db) => {
      expect(globalSearch(db, 'subsidy-confirmation').hits.some((hit) => hit.id === document.id)).toBe(false)
      expect(globalSearch(db, 'new-file').hits.some((hit) => hit.id === document.id)).toBe(true)
    })
    docs.remove(document.id)
    store.query((db) => {
      expect(globalSearch(db, 'new-file').hits.some((hit) => hit.id === document.id && hit.type === 'document')).toBe(false)
    })
  })
})
