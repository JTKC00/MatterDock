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
      MATTERDOCK_DISABLE_SEED: '1'
    }
  })
}

async function firstWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

test('actions, waiting and next action persist across relaunch', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-tasks-'))
  let app = await launch(userData)

  try {
    let page = await firstWindow(app)
    await page.getByRole('link', { name: 'Contacts' }).click()
    await page.locator('header').getByRole('button', { name: 'New Contact' }).click()
    await page.getByLabel('Name').fill('Ms Chan')
    await page.getByRole('button', { name: 'Save' }).click()

    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    const matterDialog = page.getByRole('dialog', { name: 'New matter' })
    await matterDialog.getByLabel('Title').fill('EMPF Subsidy Application')
    await matterDialog.getByRole('button', { name: 'Create matter' }).click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()

    await page.getByRole('button', { name: '+ Action' }).click()
    const actionDialog = page.getByRole('dialog', { name: 'New action' })
    await actionDialog.getByLabel('Title').fill('Send supporting documents')
    await actionDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Next action' }).locator('..')).toContainText('Send supporting documents')

    await page.getByRole('button', { name: '+ Waiting' }).click()
    const waitingDialog = page.getByRole('dialog', { name: 'New waiting item' })
    await waitingDialog.getByPlaceholder('Search other contacts').fill('Ms Chan')
    await page.getByRole('option', { name: 'Ms Chan' }).click()
    await waitingDialog.getByLabel('What are you waiting for?').fill('Confirmation of subsidy amount')
    await waitingDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Confirmation of subsidy amount')).toBeVisible()

    await page.getByRole('button', { name: 'Item actions' }).nth(1).click()
    await page.getByRole('menuitem', { name: 'Set as Next Action' }).click()
    const replace = page.getByRole('dialog', { name: 'Replace current Next Action?' })
    if (await replace.isVisible()) {
      await replace.getByRole('button', { name: 'Replace' }).click()
    }
    await expect(page.locator('.next-action')).toContainText('Waiting for Ms Chan')

    await app.close()
    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.getByText('EMPF Subsidy Application').click()
    await expect(page.locator('.next-action')).toContainText('Waiting for Ms Chan')
    await expect(page.getByText('Send supporting documents').first()).toBeVisible()
    await expect(page.getByText('Confirmation of subsidy amount').first()).toBeVisible()

    await page.getByRole('link', { name: 'Today' }).click()
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
    await page.getByRole('link', { name: 'Waiting', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Waiting' })).toBeVisible()
    await page.getByText('EMPF Subsidy Application').first().click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()

    await page.getByRole('button', { name: 'Complete' }).click()
    await page.getByRole('button', { name: 'Resolve' }).first().click()

    await app.close()
    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.getByText('EMPF Subsidy Application').click()
    await expect(page.getByText('No next action set')).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})
