import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { persistDatabase } from '../db/open'
import { DatabaseStore } from '../db/store'
import * as documents from '../db/documents'
import * as matters from '../db/matters'
import { quarantineName } from './files'
import { createDocumentService } from './service'
import {
  decideQuarantineAction,
  reconcileDocumentQuarantines,
  reconcileDocumentQuarantinesFromStore
} from './recovery'

const dirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

async function setupCopy() {
  const userData = tempDir('matterdock-rec-')
  const sourceDir = tempDir('matterdock-rec-src-')
  const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
  await store.initialize()
  const matter = store.mutate((db) => matters.createMatter(db, { title: 'EMPF Subsidy Application' }))
  const docsRoot = join(userData, 'documents')
  const service = createDocumentService(store, docsRoot)
  const source = join(sourceDir, 'pack.pdf')
  writeFileSync(source, 'MANAGED-BYTES')
  const doc = service.addCopy({ matterId: matter.id, path: source })
  return { userData, store, docsRoot, source, doc }
}

describe('quarantine decision', () => {
  it('restores copy records, deletes committed removals, and leaves ambiguous states', () => {
    expect(decideQuarantineAction({ storageMode: 'copy' }, false)).toBe('restore')
    expect(decideQuarantineAction(null, false)).toBe('delete')
    expect(decideQuarantineAction({ storageMode: 'reference' }, false)).toBe('leave')
    expect(decideQuarantineAction({ storageMode: 'copy' }, true)).toBe('leave')
    expect(decideQuarantineAction('error', false)).toBe('leave')
  })
})

describe('document quarantine reconciliation', () => {
  it('restores a managed copy when crash happened before durable delete', async () => {
    const { store, docsRoot, doc } = await setupCopy()
    const active = join(docsRoot, doc.id)
    const quarantine = join(docsRoot, quarantineName(doc.id))
    renameSync(active, quarantine)
    expect(existsSync(active)).toBe(false)
    expect(existsSync(quarantine)).toBe(true)

    reconcileDocumentQuarantinesFromStore(store, docsRoot)

    expect(store.query((db) => documents.getDocument(db, doc.id)).id).toBe(doc.id)
    expect(existsSync(active)).toBe(true)
    expect(existsSync(quarantine)).toBe(false)
    expect(readFileSync(join(active, 'pack.pdf'), 'utf8')).toBe('MANAGED-BYTES')
  })

  it('deletes a quarantine after the document record is already gone', async () => {
    const { store, docsRoot, doc } = await setupCopy()
    const quarantine = join(docsRoot, quarantineName(doc.id))
    renameSync(join(docsRoot, doc.id), quarantine)
    store.mutate((db) => documents.deleteDocumentRecord(db, doc.id))

    reconcileDocumentQuarantinesFromStore(store, docsRoot)

    expect(store.query((db) => documents.findDocument(db, doc.id))).toBeNull()
    expect(existsSync(quarantine)).toBe(false)
    expect(existsSync(join(docsRoot, doc.id))).toBe(false)
  })

  it('ignores invalid quarantine names', async () => {
    const { store, docsRoot } = await setupCopy()
    mkdirSync(join(docsRoot, '.removing-foo'))
    mkdirSync(join(docsRoot, '.something'))
    mkdirSync(join(docsRoot, 'random-folder'))

    reconcileDocumentQuarantinesFromStore(store, docsRoot)

    expect(existsSync(join(docsRoot, '.removing-foo'))).toBe(true)
    expect(existsSync(join(docsRoot, '.something'))).toBe(true)
    expect(existsSync(join(docsRoot, 'random-folder'))).toBe(true)
  })

  it('leaves a quarantine when the same id is a reference record', async () => {
    const { store, docsRoot, doc } = await setupCopy()
    const quarantine = join(docsRoot, quarantineName(doc.id))
    renameSync(join(docsRoot, doc.id), quarantine)
    store.mutate((db) => {
      db.run(`UPDATE documents SET storage_mode = 'reference', managed_path = NULL WHERE id = ?`, [doc.id])
    })

    reconcileDocumentQuarantinesFromStore(store, docsRoot)

    expect(store.query((db) => documents.getDocument(db, doc.id)).storageMode).toBe('reference')
    expect(existsSync(quarantine)).toBe(true)
    expect(existsSync(join(docsRoot, doc.id))).toBe(false)
  })

  it('does not overwrite an existing active folder', async () => {
    const { store, docsRoot, doc } = await setupCopy()
    const active = join(docsRoot, doc.id)
    const quarantine = join(docsRoot, quarantineName(doc.id))
    mkdirSync(quarantine)
    writeFileSync(join(quarantine, 'other.pdf'), 'OTHER')
    writeFileSync(join(active, 'pack.pdf'), 'ACTIVE')

    reconcileDocumentQuarantinesFromStore(store, docsRoot)

    expect(readFileSync(join(active, 'pack.pdf'), 'utf8')).toBe('ACTIVE')
    expect(existsSync(join(quarantine, 'other.pdf'))).toBe(true)
  })

  it('leaves the quarantine when lookup fails', () => {
    const root = tempDir('matterdock-rec-lookup-')
    const id = '550e8400-e29b-41d4-a716-446655440000'
    mkdirSync(join(root, quarantineName(id)), { recursive: true })
    writeFileSync(join(root, quarantineName(id), 'pack.pdf'), 'SAFE')

    reconcileDocumentQuarantines(root, () => 'error')

    expect(existsSync(join(root, quarantineName(id)))).toBe(true)
  })

  it('leaves the quarantine when restore fails', () => {
    const root = tempDir('matterdock-rec-restore-')
    const id = '550e8400-e29b-41d4-a716-446655440000'
    mkdirSync(join(root, quarantineName(id)), { recursive: true })

    expect(() =>
      reconcileDocumentQuarantines(
        root,
        () => ({ storageMode: 'copy' }),
        {
          restore: () => {
            throw new Error('rename failed')
          }
        }
      )
    ).not.toThrow()
    expect(existsSync(join(root, quarantineName(id)))).toBe(true)
  })
})
