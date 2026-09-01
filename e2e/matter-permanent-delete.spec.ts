import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function launch(userData: string, locale: 'en' | 'zh-HK'): Promise<ElectronApplication> {
  return electron.launch({
    args: ['--disable-gpu', '--no-sandbox', root],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MATTERDOCK_USER_DATA: userData,
      MATTERDOCK_DISABLE_SEED: '1',
      MATTERDOCK_LOCALE: locale
    }
  })
}

async function firstWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

async function closeApp(app: ElectronApplication): Promise<void> {
  const child = app.process()
  await app.close()
  if (child && child.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}

async function matterIdFromPage(page: Page): Promise<string> {
  const url = page.url()
  const id = url.split('/').pop()?.split(/[?#]/)[0]
  if (!id) throw new Error(`No matter id in ${url}`)
  return id
}

async function addDocuments(page: Page, matterId: string, referencePath: string, copyPath: string): Promise<string> {
  return page.evaluate(
    async ({ id, reference, copy }) => {
      const api = (
        window as unknown as {
          matterdock: {
            documents: {
              addReference: (input: { matterId: string; path: string }) => Promise<{
                ok: boolean
                error?: string
              }>
              addCopy: (input: { matterId: string; path: string }) => Promise<{
                ok: boolean
                error?: string
              }>
              listForMatter: (matterId: string) => Promise<{
                ok: boolean
                error?: string
                data?: Array<{ storageMode: string; resolvedPath: string | null }>
              }>
            }
          }
        }
      ).matterdock
      const referenceResult = await api.documents.addReference({ matterId: id, path: reference })
      if (!referenceResult.ok) throw new Error(referenceResult.error ?? 'reference document failed')
      const copyResult = await api.documents.addCopy({ matterId: id, path: copy })
      if (!copyResult.ok) throw new Error(copyResult.error ?? 'managed document failed')
      const listed = await api.documents.listForMatter(id)
      if (!listed.ok || !listed.data) throw new Error(listed.error ?? 'document listing failed')
      const managed = listed.data.find((document) => document.storageMode === 'copy')
      if (!managed?.resolvedPath) throw new Error('managed document path was not resolved')
      return managed.resolvedPath
    },
    { id: matterId, reference: referencePath, copy: copyPath }
  )
}

async function assertDeletedFromLiveQueries(page: Page, matterId: string, title: string): Promise<void> {
  const result = await page.evaluate(
    async ({ id, title }) => {
      const api = (
        window as unknown as {
          matterdock: {
            matters: {
              list: (query: { status: 'all' }) => Promise<{
                ok: boolean
                data?: Array<{ id: string }>
                error?: string
              }>
            }
            search: {
              global: (query: string) => Promise<{
                ok: boolean
                data?: { hits: Array<{ matterId: string | null }> }
                error?: string
              }>
            }
          }
        }
      ).matterdock
      const matters = await api.matters.list({ status: 'all' })
      if (!matters.ok || !matters.data) throw new Error(matters.error ?? 'matter listing failed')
      const search = await api.search.global(title)
      if (!search.ok || !search.data) throw new Error(search.error ?? 'search failed')
      return {
        matterFound: matters.data.some((matter) => matter.id === id),
        searchFound: search.data.hits.some((hit) => hit.matterId === id)
      }
    },
    { id: matterId, title }
  )
  expect(result.matterFound).toBe(false)
  expect(result.searchFound).toBe(false)
  await expect(page.getByText(title, { exact: true })).toHaveCount(0)
}

test('archived Matter permanent deletion has an explicit safe English flow', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-delete-en-e2e-'))
  const files = mkdtempSync(join(tmpdir(), 'matterdock-delete-en-src-'))
  const referencePath = join(files, 'reference-original.txt')
  const copySourcePath = join(files, 'managed-source.txt')
  writeFileSync(referencePath, 'REFERENCE-ORIGINAL-CONTENTS')
  writeFileSync(copySourcePath, 'MANAGED-SOURCE-CONTENTS')
  const title = 'Permanent deletion E2E'
  const app = await launch(userData, 'en')

  try {
    const page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter', exact: true }).click()
    const createDialog = page.getByRole('dialog', { name: 'New matter' })
    await createDialog.getByLabel('Title').fill(title)
    await createDialog.getByRole('button', { name: 'Create matter', exact: true }).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    const matterId = await matterIdFromPage(page)

    await expect(page.getByRole('button', { name: 'Delete permanently', exact: true })).toHaveCount(0)
    const managedPath = await addDocuments(page, matterId, referencePath, copySourcePath)
    expect(existsSync(managedPath)).toBe(true)

    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(page).toHaveURL(/#\/matters$/)
    await page.locator('#status-filter').selectOption('archived')
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    await page.getByText(title, { exact: true }).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    const deleteTrigger = page.getByRole('button', { name: 'Delete permanently', exact: true })
    await expect(deleteTrigger).toBeVisible()

    await deleteTrigger.click()
    let confirmation = page.getByRole('dialog', { name: `Permanently delete “${title}”?` })
    await expect(confirmation).toBeVisible()
    await expect(confirmation).toContainText('This action cannot be undone.')
    await expect(confirmation).toContainText('MatterDock-managed document copies')
    await expect(confirmation).toContainText('Referenced original files')
    await expect(confirmation).toContainText('Organisation, Contact and Tag records')
    await expect(confirmation.getByRole('button', { name: 'Delete permanently', exact: true })).not.toBeFocused()
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(confirmation).toHaveCount(0)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()

    await deleteTrigger.click()
    confirmation = page.getByRole('dialog', { name: `Permanently delete “${title}”?` })
    await confirmation.getByRole('button', { name: 'Delete permanently', exact: true }).click()
    await expect(page.getByText('Matter permanently deleted.', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/#\/matters$/)
    await assertDeletedFromLiveQueries(page, matterId, title)
    await page.getByRole('link', { name: 'Search', exact: true }).click()
    await page.getByLabel('Search MatterDock').fill(title)
    await expect(page.getByText('No matching matters, people, activity or documents.', { exact: true })).toBeVisible()

    expect(readFileSync(referencePath, 'utf8')).toBe('REFERENCE-ORIGINAL-CONTENTS')
    expect(readFileSync(copySourcePath, 'utf8')).toBe('MANAGED-SOURCE-CONTENTS')
    expect(existsSync(referencePath)).toBe(true)
    expect(existsSync(managedPath)).toBe(false)
  } finally {
    await closeApp(app).catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
    rmSync(files, { recursive: true, force: true })
  }
})

test('archived Matter permanent deletion is fully localized in zh-HK', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-delete-zh-e2e-'))
  const title = '永久刪除流程測試'
  const app = await launch(userData, 'zh-HK')

  try {
    const page = await firstWindow(app)
    await page.getByRole('link', { name: '事項', exact: true }).click()
    await page.locator('header').getByRole('button', { name: '新增事項', exact: true }).click()
    const createDialog = page.getByRole('dialog', { name: '新增事項' })
    await createDialog.getByLabel('標題').fill(title)
    await createDialog.getByRole('button', { name: '建立事項', exact: true }).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()

    await expect(page.getByRole('button', { name: '永久刪除', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '封存', exact: true }).click()
    await expect(page).toHaveURL(/#\/matters$/)
    await page.locator('#status-filter').selectOption('archived')
    await page.getByText(title, { exact: true }).click()
    const deleteTrigger = page.getByRole('button', { name: '永久刪除', exact: true })
    await expect(deleteTrigger).toBeVisible()

    await deleteTrigger.click()
    let confirmation = page.getByRole('dialog', { name: `永久刪除「${title}」？` })
    await expect(confirmation).toContainText('這項操作無法復原。')
    await expect(confirmation).toContainText('MatterDock 管理的文件副本')
    await expect(confirmation).toContainText('參照的原始檔案')
    await expect(confirmation).toContainText('機構、聯絡人及標籤記錄')
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    await expect(confirmation).toHaveCount(0)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()

    await deleteTrigger.click()
    confirmation = page.getByRole('dialog', { name: `永久刪除「${title}」？` })
    await confirmation.getByRole('button', { name: '永久刪除', exact: true }).click()
    await expect(page.getByText('事項已永久刪除。', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/#\/matters$/)
    await expect(page.getByText(title, { exact: true })).toHaveCount(0)
  } finally {
    await closeApp(app).catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})
