import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { USER_ERRORS } from '@shared/errors'
import { persistDatabase } from '../db/open'
import { DatabaseStore } from '../db/store'
import * as matters from '../db/matters'
import { createDocumentService } from './service'

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
})
