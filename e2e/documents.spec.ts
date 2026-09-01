import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['--disable-gpu', '--no-sandbox', root],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MATTERDOCK_USER_DATA: userData,
      MATTERDOCK_DISABLE_SEED: '1',
      MATTERDOCK_LOCALE: 'en'
    }
  })
}

async function firstWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

async function matterIdFromPage(page: Page): Promise<string> {
  const url = page.url()
  const id = url.split('/').pop()
  if (!id) throw new Error(`No matter id in ${url}`)
  return id
}

test('document references and copies persist and remove safely', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-docs-e2e-'))
  const files = mkdtempSync(join(tmpdir(), 'matterdock-docs-src-'))
  const referencePath = join(files, 'subsidy-letter.pdf')
  const copyPath = join(files, 'subsidy-confirmation.pdf')
  writeFileSync(referencePath, 'REFERENCE-ORIGINAL')
  writeFileSync(copyPath, 'COPY-ORIGINAL')
  let app = await launch(userData)

  try {
    let page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('EMPF Subsidy Application')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
    const matterId = await matterIdFromPage(page)

    await page.evaluate(
      async ({ matterId: id, referencePath: ref, copyPath: copy }) => {
        const api = (
          window as unknown as {
            matterdock: {
              documents: {
                addReference: (input: { matterId: string; path: string; notes?: string }) => Promise<unknown>
                addCopy: (input: { matterId: string; path: string }) => Promise<unknown>
              }
            }
          }
        ).matterdock
        await api.documents.addReference({ matterId: id, path: ref, notes: 'Signed version' })
        await api.documents.addCopy({ matterId: id, path: copy })
      },
      { matterId, referencePath, copyPath }
    )
    await page.reload()
    await expect(page.getByText('subsidy-letter.pdf', { exact: true })).toBeVisible()
    await expect(page.getByText('subsidy-confirmation.pdf', { exact: true })).toBeVisible()
    await expect(page.getByText('Reference original').first()).toBeVisible()
    await expect(page.getByText('MatterDock copy')).toBeVisible()

    await app.close()
    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.getByText('EMPF Subsidy Application').click()
    await expect(page.getByText('subsidy-letter.pdf', { exact: true })).toBeVisible()
    await expect(page.getByText('subsidy-confirmation.pdf', { exact: true })).toBeVisible()

    const listed = await page.evaluate(async (id) => {
      const api = (window as unknown as { matterdock: { documents: { listForMatter: (matterId: string) => Promise<{ ok: boolean; error?: string; data?: Array<{ id: string; storageMode: string; resolvedPath: string | null }> }> } } }).matterdock
      const result = await api.documents.listForMatter(id)
      if (!result.ok || !result.data) throw new Error(result.error ?? 'list failed')
      return result.data
    }, matterId)
    const reference = listed.find((item) => item.storageMode === 'reference')
    const copy = listed.find((item) => item.storageMode === 'copy')
    if (!reference || !copy) throw new Error('documents missing after relaunch')
    expect(existsSync(referencePath)).toBe(true)
    expect(copy.resolvedPath && existsSync(copy.resolvedPath)).toBe(true)

    await page.evaluate(async (ids) => {
      const api = (window as unknown as { matterdock: { documents: { remove: (id: string) => Promise<unknown> } } }).matterdock
      await api.documents.remove(ids.reference)
      await api.documents.remove(ids.copy)
    }, { reference: reference.id, copy: copy.id })
    await page.reload()
    await expect(page.getByText('No documents attached.')).toBeVisible()
    expect(readFileSync(referencePath, 'utf8')).toBe('REFERENCE-ORIGINAL')
    expect(readFileSync(copyPath, 'utf8')).toBe('COPY-ORIGINAL')
    expect(copy.resolvedPath ? existsSync(copy.resolvedPath) : true).toBe(false)
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
    rmSync(files, { recursive: true, force: true })
  }
})
