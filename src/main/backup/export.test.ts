import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { persistDatabase } from '../db/open'
import { DatabaseStore } from '../db/store'
import * as matters from '../db/matters'
import * as organisations from '../db/organisations'
import * as contacts from '../db/contacts'
import { createDocumentService } from '../documents/service'
import { createDataExport } from './export'

const dirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  process.env.MATTERDOCK_DISABLE_SEED = '1'
})

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('data portability export', () => {
  it('writes JSON, CSV, README and managed copies without referenced originals', async () => {
    const userData = tempDir('matterdock-export-')
    const sourceDir = tempDir('matterdock-export-src-')
    const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
    await store.initialize()
    const documentsRoot = join(userData, 'documents')
    const service = createDocumentService(store, documentsRoot)
    const org = store.mutate((db) => organisations.createOrganisation(db, { name: '地政總署' }))
    store.mutate((db) => organisations.addAlias(db, org.id, 'Lands Department'))
    const contact = store.mutate((db) =>
      contacts.createContact(db, { name: 'Alex, Chan', organisationId: org.id, email: 'alex@example.com' })
    )
    const matter = store.mutate((db) =>
      matters.createMatter(db, {
        title: '=1+1',
        organisationId: org.id
      })
    )
    store.mutate((db) =>
      matters.updateMatter(db, matter.id, { description: 'He said "proceed".\nNext line' })
    )
    store.mutate((db) => matters.linkMatterContact(db, { matterId: matter.id, contactId: contact.id, role: 'Officer' }))
    const referencePath = join(sourceDir, 'letter.pdf')
    const copyPath = join(sourceDir, 'copy.pdf')
    writeFileSync(referencePath, 'REFERENCE-NOT-EXPORTED')
    writeFileSync(copyPath, 'MANAGED-EXPORT-BYTES')
    service.addReference({ matterId: matter.id, path: referencePath })
    const copy = service.addCopy({ matterId: matter.id, path: copyPath })

    const destParent = tempDir('matterdock-export-out-')
    const exported = await createDataExport({
      store,
      documentsRoot,
      destinationDirectory: destParent,
      appVersion: '0.6.0'
    })

    const json = JSON.parse(readFileSync(join(exported, 'matterdock.json'), 'utf8')) as {
      exportSchemaVersion: number
      matters: Array<{ id: string; title: string }>
      contacts: Array<{ id: string; name: string }>
      organisations: Array<{ name: string }>
      matterContacts: Array<{ matterId: string; contactId: string }>
      documents: Array<{ storageMode: string; originalPath: string | null }>
    }
    expect(json.exportSchemaVersion).toBe(1)
    expect(json.matters.some((row) => row.title === '=1+1')).toBe(true)
    expect(json.organisations.some((row) => row.name === '地政總署')).toBe(true)
    expect(json.matterContacts[0]?.matterId).toBe(matter.id)
    expect(json.matterContacts[0]?.contactId).toBe(contact.id)
    expect(json.documents.some((row) => row.storageMode === 'reference')).toBe(true)

    const mattersCsv = readFileSync(join(exported, 'csv', 'matters.csv'), 'utf8')
    expect(mattersCsv).toContain("'=1+1")
    expect(mattersCsv).toContain('""proceed""')
    const contactsCsv = readFileSync(join(exported, 'csv', 'contacts.csv'), 'utf8')
    expect(contactsCsv).toContain('"Alex, Chan"')
    const orgCsv = readFileSync(join(exported, 'csv', 'organisations.csv'), 'utf8')
    expect(orgCsv).toContain('地政總署')
    const relCsv = readFileSync(join(exported, 'csv', 'matter-contacts.csv'), 'utf8')
    expect(relCsv).toContain(matter.id)
    expect(relCsv).toContain(contact.id)

    const managedDir = join(exported, 'managed-documents', copy.id)
    expect(existsSync(managedDir)).toBe(true)
    const managedFiles = readdirSync(managedDir)
    expect(readFileSync(join(managedDir, managedFiles[0] ?? ''), 'utf8')).toBe('MANAGED-EXPORT-BYTES')

    const exportBytes = readFileSync(join(exported, 'matterdock.json'), 'utf8')
    expect(exportBytes).not.toContain('REFERENCE-NOT-EXPORTED')
    const readme = readFileSync(join(exported, 'README.txt'), 'utf8')
    expect(readme).toContain('Referenced original files are not copied')
    expect(readme).toContain('JSON is the canonical open structured export')
    expect(existsSync(join(exported, 'csv', 'documents.csv'))).toBe(true)
  })
})
