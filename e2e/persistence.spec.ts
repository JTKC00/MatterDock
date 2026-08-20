import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [root],
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

test('creates a full matter and keeps it after restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-e2e-'))
  let app = await launch(userData)

  try {
    let page = await firstWindow(app)

    await page.getByRole('link', { name: 'Organisations' }).click()
    await page.locator('header').getByRole('button', { name: 'New Organisation' }).click()
    await page.getByLabel('Canonical name').fill('eMPF Platform Company Limited')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'eMPF Platform Company Limited' })).toBeVisible()

    await page.getByLabel('New alias').fill('eMPF')
    await page.getByRole('button', { name: 'Add Alias' }).click()
    await expect(page.getByText('eMPF', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Contacts' }).click()
    await page.locator('header').getByRole('button', { name: 'New Contact' }).click()
    await page.getByLabel('Name').fill('Alex Chan')
    await page.getByLabel('Email').fill('alex@example.com')
    await page.getByPlaceholder('Optional organisation').fill('eMPF')
    await page.getByRole('option', { name: 'eMPF Platform Company Limited' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Alex Chan' })).toBeVisible()

    await page.getByRole('link', { name: 'Matters' }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    const matterDialog = page.getByRole('dialog', { name: 'New matter' })
    await matterDialog.getByLabel('Title').fill('EMPF Subsidy Application')
    await matterDialog.getByPlaceholder('Search or create an organisation').fill('eMPF')
    await page.getByRole('option', { name: 'eMPF Platform Company Limited' }).click()
    await matterDialog.getByLabel('Reference').fill('EMPF-2026-00123')
    await matterDialog.getByLabel('Status').selectOption('waiting')
    await matterDialog.getByLabel('Tags').fill('HR, Government')
    await matterDialog.getByRole('button', { name: 'Create matter' }).click()

    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
    await expect(page.getByText('No next action set')).toBeVisible()
    await expect(page.getByText('No activity yet.')).toBeVisible()

    await page.getByRole('button', { name: '+ Add Contact' }).click()
    await page.getByPlaceholder('Search contacts').fill('Alex')
    await page.getByRole('option', { name: 'Alex Chan' }).click()
    await page.getByLabel('Role').fill('Case Officer')
    await page.getByRole('button', { name: 'Link contact' }).click()
    await expect(page.getByRole('link', { name: 'Alex Chan' })).toBeVisible()
    await expect(page.getByText('Case Officer')).toBeVisible()

    await app.close()

    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters' }).click()
    await expect(page.getByText('EMPF Subsidy Application')).toBeVisible()
    await expect(page.getByText('eMPF Platform Company Limited').first()).toBeVisible()
    await expect(page.getByText('Waiting').first()).toBeVisible()
    await expect(page.getByText('Reference: EMPF-2026-00123')).toBeVisible()
    await page.getByText('EMPF Subsidy Application').click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Alex Chan' })).toBeVisible()
    await expect(page.getByText('HR')).toBeVisible()
    await expect(page.getByText('Government')).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})
