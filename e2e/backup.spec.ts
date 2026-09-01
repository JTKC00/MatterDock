import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
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

test('backup restore round-trip returns the workspace to the backed-up state', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-backup-e2e-'))
  const files = mkdtempSync(join(tmpdir(), 'matterdock-backup-e2e-src-'))
  const backupDir = mkdtempSync(join(tmpdir(), 'matterdock-backup-e2e-out-'))
  const backupPath = join(backupDir, 'MatterDock-test.matterdock-backup')
  const copyPath = join(files, 'subsidy-confirmation.pdf')
  const referencePath = join(files, 'subsidy-letter.pdf')
  writeFileSync(copyPath, 'MANAGED-E2E')
  writeFileSync(referencePath, 'REFERENCE-E2E')
  const app = await launch(userData)

  try {
    await app.evaluate(async ({ dialog }, savePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath })
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savePath] })
    }, backupPath)

    const page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('EMPF Subsidy Application')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
    const matterId = await matterIdFromPage(page)

    await page.evaluate(
      async ({ matterId: id, copyPath: copy, referencePath: ref }) => {
        const api = (
          window as unknown as {
            matterdock: {
              documents: {
                addCopy: (input: { matterId: string; path: string }) => Promise<unknown>
                addReference: (input: { matterId: string; path: string }) => Promise<unknown>
              }
              events: {
                create: (input: { matterId: string; type: string; body: string }) => Promise<unknown>
              }
              tasks: {
                createAction: (input: { matterId: string; title: string; setAsNextAction?: boolean }) => Promise<unknown>
              }
            }
          }
        ).matterdock
        await api.documents.addCopy({ matterId: id, path: copy })
        await api.documents.addReference({ matterId: id, path: ref })
        await api.events.create({ matterId: id, type: 'note', body: 'Filed the papers' })
        await api.tasks.createAction({ matterId: id, title: 'Call case officer', setAsNextAction: true })
      },
      { matterId, copyPath, referencePath }
    )
    await page.reload()
    await expect(page.getByText('subsidy-confirmation.pdf', { exact: true })).toBeVisible()
    await expect(page.getByText('Call case officer').first()).toBeVisible()

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Create Backup…' }).click()
    await expect(page.getByText('Backup created.')).toBeVisible()
    expect(existsSync(backupPath)).toBe(true)

    await page.evaluate(async ({ matterId: id }) => {
      const api = (
        window as unknown as {
          matterdock: {
            matters: {
              update: (id: string, input: { title: string }) => Promise<unknown>
              create: (input: { title: string }) => Promise<unknown>
            }
          }
        }
      ).matterdock
      await api.matters.update(id, { title: 'Changed after backup' })
      await api.matters.create({ title: 'Matter B' })
    }, { matterId })
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await expect(page.getByText('Changed after backup')).toBeVisible()
    await expect(page.getByText('Matter B')).toBeVisible()

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Restore Backup…' }).click()
    await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toBeVisible()
    await page.getByRole('dialog', { name: 'Restore this backup?' }).getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText('Backup restored successfully.')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('EMPF Subsidy Application')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Matter B')).toHaveCount(0)
    await page.getByText('EMPF Subsidy Application').click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
    await expect(page.getByText('Call case officer').first()).toBeVisible()
    await expect(page.getByText('Filed the papers').first()).toBeVisible()
    await expect(page.getByText('subsidy-confirmation.pdf', { exact: true })).toBeVisible()
    await expect(page.getByText('subsidy-letter.pdf', { exact: true })).toBeVisible()

    await page.keyboard.press('Control+k')
    await page.getByPlaceholder('Search matters, contacts, activity and documents…').fill('EMPF Subsidy')
    await expect(page.getByText('EMPF Subsidy Application').first()).toBeVisible()
  } finally {
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
    rmSync(userData, { recursive: true, force: true })
    rmSync(files, { recursive: true, force: true })
    rmSync(backupDir, { recursive: true, force: true })
  }
})
