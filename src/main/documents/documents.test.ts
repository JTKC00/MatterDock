import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { USER_ERRORS } from '@shared/errors'
import { persistDatabase } from '../db/open'
import { DatabaseStore } from '../db/store'
import * as matters from '../db/matters'
import { createDocumentService } from './service'
import { quarantineName } from './files'
import * as documents from '../db/documents'

const dirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

async function setup() {
  const userData = tempDir('matterdock-docsvc-')
  const sourceDir = tempDir('matterdock-src-')
  const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), persistDatabase)
  await store.initialize()
  const matter = store.mutate((db) => matters.createMatter(db, { title: 'EMPF Subsidy Application' }))
  const service = createDocumentService(store, join(userData, 'documents'))
  return { userData, sourceDir, store, matter, service }
}

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('document reference and copy', () => {
  it('attaches a reference without touching the source and removes only the record', async () => {
    const { sourceDir, store, matter, service } = await setup()
    const source = join(sourceDir, 'subsidy-letter.pdf')
    writeFileSync(source, 'ORIGINAL')
    const doc = service.addReference({ matterId: matter.id, path: source, notes: 'Signed version' })
    expect(doc.storageMode).toBe('reference')
    expect(doc.displayName).toBe('subsidy-letter.pdf')
    expect(doc.available).toBe(true)
    expect(readFileSync(source, 'utf8')).toBe('ORIGINAL')
    expect(store.query((db) => matters.getMatter(db, matter.id)).updatedAt >= matter.updatedAt).toBe(true)

    service.remove(doc.id)
    expect(existsSync(source)).toBe(true)
    expect(service.listForMatter(matter.id)).toHaveLength(0)
  })

  it('copies bytes into the workspace and deletes only the managed copy on remove', async () => {
    const { userData, sourceDir, matter, service } = await setup()
    const source = join(sourceDir, 'subsidy-confirmation.pdf')
    writeFileSync(source, 'MANAGED-COPY')
    const doc = service.addCopy({ matterId: matter.id, path: source })
    expect(doc.storageMode).toBe('copy')
    expect(doc.managedPath).toBeTruthy()
    expect(doc.resolvedPath && readFileSync(doc.resolvedPath, 'utf8')).toBe('MANAGED-COPY')
    expect(readFileSync(source, 'utf8')).toBe('MANAGED-COPY')

    service.remove(doc.id)
    expect(existsSync(source)).toBe(true)
    expect(existsSync(join(userData, 'documents', doc.id))).toBe(false)
    expect(service.listForMatter(matter.id)).toHaveLength(0)
  })

  it('does not create a record when the source file is missing', async () => {
    const { matter, service } = await setup()
    expect(() => service.addReference({ matterId: matter.id, path: join(tmpdir(), 'missing-file.pdf') })).toThrow(
      USER_ERRORS.fileUnavailable
    )
    expect(service.listForMatter(matter.id)).toHaveLength(0)
  })

  it('cleans up a managed copy if persist fails after the file is copied', async () => {
    const userData = tempDir('matterdock-fail-')
    const sourceDir = tempDir('matterdock-fail-src-')
    let fail = false
    const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), (db, filePath) => {
      if (fail) throw new Error('simulated persist failure')
      persistDatabase(db, filePath)
    })
    await store.initialize()
    const matter = store.mutate((db) => matters.createMatter(db, { title: 'EMPF Subsidy Application' }))
    const service = createDocumentService(store, join(userData, 'documents'))
    const source = join(sourceDir, 'pack.pdf')
    writeFileSync(source, 'BYTES')
    fail = true
    expect(() => service.addCopy({ matterId: matter.id, path: source })).toThrow()
    expect(service.listForMatter(matter.id)).toHaveLength(0)
    expect(existsSync(join(userData, 'documents'))).toBe(true)
    expect(existsSync(source)).toBe(true)
  })

  it('relinks a missing reference and marks missing files without crashing', async () => {
    const { sourceDir, matter, service } = await setup()
    const source = join(sourceDir, 'old-name.pdf')
    writeFileSync(source, 'A')
    const doc = service.addReference({ matterId: matter.id, path: source })
    rmSync(source)
    const missing = service.listForMatter(matter.id)[0]
    expect(missing.available).toBe(false)
    expect(missing.availability).toBe('missing_reference')

    const next = join(sourceDir, 'new-name.pdf')
    writeFileSync(next, 'B')
    const relinked = service.relink(doc.id, { path: next })
    expect(relinked.displayName).toBe('new-name.pdf')
    expect(relinked.available).toBe(true)
    expect(relinked.originalPath).toBe(next)
  })

  it('prevents attaching the same original path twice in the same mode', async () => {
    const { sourceDir, matter, service } = await setup()
    const source = join(sourceDir, 'same.pdf')
    writeFileSync(source, 'X')
    service.addReference({ matterId: matter.id, path: source })
    expect(() => service.addReference({ matterId: matter.id, path: source })).toThrow(USER_ERRORS.documentDuplicate)
  })

  it('rolls managed copy removal back if durable delete fails', async () => {
    const userData = tempDir('matterdock-rm-fail-')
    const sourceDir = tempDir('matterdock-rm-fail-src-')
    let fail = false
    const store = new DatabaseStore(join(userData, 'matterdock.sqlite'), (db, filePath) => {
      if (fail) throw new Error('simulated persist failure')
      persistDatabase(db, filePath)
    })
    await store.initialize()
    const matter = store.mutate((db) => matters.createMatter(db, { title: 'EMPF Subsidy Application' }))
    const service = createDocumentService(store, join(userData, 'documents'))
    const source = join(sourceDir, 'pack.pdf')
    writeFileSync(source, 'BYTES')
    const doc = service.addCopy({ matterId: matter.id, path: source })
    fail = true
    expect(() => service.remove(doc.id)).toThrow()
    expect(store.query((db) => documents.getDocument(db, doc.id)).id).toBe(doc.id)
    expect(existsSync(join(userData, 'documents', doc.id))).toBe(true)
    expect(existsSync(join(userData, 'documents', quarantineName(doc.id)))).toBe(false)
    expect(existsSync(source)).toBe(true)
  })

  it('does not restore an active folder if cleanup fails after durable delete', async () => {
    const { userData, sourceDir, matter, store } = await setup()
    const service = createDocumentService(store, join(userData, 'documents'), {
      cleanupQuarantine: () => {
        throw new Error('cleanup failed')
      }
    })
    const source = join(sourceDir, 'pack.pdf')
    writeFileSync(source, 'BYTES')
    const doc = service.addCopy({ matterId: matter.id, path: source })
    expect(service.remove(doc.id)).toEqual({ id: doc.id })
    expect(service.listForMatter(matter.id)).toHaveLength(0)
    expect(existsSync(join(userData, 'documents', doc.id))).toBe(false)
    expect(existsSync(join(userData, 'documents', quarantineName(doc.id)))).toBe(true)
    expect(existsSync(source)).toBe(true)
  })

  it('rejects relink on copies and duplicate reference paths, but allows self-relink', async () => {
    const { sourceDir, matter, service } = await setup()
    const first = join(sourceDir, 'one.pdf')
    const second = join(sourceDir, 'two.pdf')
    const copySource = join(sourceDir, 'copy.pdf')
    writeFileSync(first, '1')
    writeFileSync(second, '2')
    writeFileSync(copySource, 'C')
    const referenceA = service.addReference({ matterId: matter.id, path: first })
    const referenceB = service.addReference({ matterId: matter.id, path: second })
    const copied = service.addCopy({ matterId: matter.id, path: copySource })

    expect(() => service.relink(copied.id, { path: first })).toThrow(USER_ERRORS.cannotRelinkCopy)
    expect(() => service.relink(referenceB.id, { path: first })).toThrow(USER_ERRORS.documentDuplicate)

    const same = service.relink(referenceA.id, { path: first })
    expect(same.id).toBe(referenceA.id)
    expect(same.originalPath).toBe(first)
  })
})
