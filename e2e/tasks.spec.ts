import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
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

test('clear next action and replacement confirmation persist', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-next-'))
  let app = await launch(userData)
  try {
    let page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('Integrity Matter')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()

    await page.getByRole('button', { name: '+ Action' }).click()
    await page.getByRole('dialog', { name: 'New action' }).getByLabel('Title').fill('Send supporting documents')
    await page.getByRole('dialog', { name: 'New action' }).getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('.next-action')).toContainText('Send supporting documents')

    await page.getByRole('button', { name: 'Item actions' }).first().click()
    await page.getByRole('menuitem', { name: 'Clear Next Action' }).click()
    await expect(page.getByText('No next action set')).toBeVisible()

    await app.close()
    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.getByText('Integrity Matter').click()
    await expect(page.getByText('No next action set')).toBeVisible()

    await page.getByRole('button', { name: 'Item actions' }).first().click()
    await page.getByRole('menuitem', { name: 'Set as Next Action' }).click()
    await expect(page.locator('.next-action')).toContainText('Send supporting documents')

    await page.getByRole('button', { name: '+ Action' }).click()
    const second = page.getByRole('dialog', { name: 'New action' })
    await expect(second.getByText('This matter already has a Next Action.')).toBeVisible()
    await second.getByLabel('Title').fill('Call Lands Department')
    await second.getByRole('button', { name: 'Save' }).click()

    await page.getByRole('button', { name: 'Item actions' }).nth(1).click()
    await page.getByRole('menuitem', { name: 'Set as Next Action' }).click()
    const replace = page.getByRole('dialog', { name: 'Replace current Next Action?' })
    await replace.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.next-action')).toContainText('Send supporting documents')

    await page.getByRole('button', { name: 'Item actions' }).nth(1).click()
    await page.getByRole('menuitem', { name: 'Set as Next Action' }).click()
    await page.getByRole('dialog', { name: 'Replace current Next Action?' }).getByRole('button', { name: 'Replace' }).click()
    await expect(page.locator('.next-action')).toContainText('Call Lands Department')
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})

function localDatetime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

test('archived matters leave Today and Waiting until restored', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-archive-'))
  const app = await launch(userData)
  try {
    const page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('Archive Lifecycle Matter')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()

    await page.getByRole('button', { name: '+ Action' }).click()
    const actionDialog = page.getByRole('dialog', { name: 'New action' })
    await actionDialog.getByLabel('Title').fill('File pack today')
    await actionDialog.getByLabel('Due').fill(localDatetime(new Date()))
    await actionDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('.next-action')).toContainText('File pack today')

    await page.getByRole('button', { name: '+ Waiting' }).click()
    const waitingDialog = page.getByRole('dialog', { name: 'New waiting item' })
    await waitingDialog.getByPlaceholder('Search other contacts').fill('Lands Department')
    await waitingDialog.getByLabel('What are you waiting for?').fill('Subsidy confirmation')
    await waitingDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Subsidy confirmation')).toBeVisible()

    await page.getByRole('link', { name: 'Today' }).click()
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
    await expect(page.getByText('File pack today', { exact: true })).toBeVisible()
    await expect(page.getByText('Archive Lifecycle Matter').first()).toBeVisible()
    await expect(page.getByText(/Subsidy confirmation/)).toBeVisible()

    await page.getByRole('link', { name: 'Waiting', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Waiting' })).toBeVisible()
    await expect(page.getByText('Subsidy confirmation', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: /Archive Lifecycle Matter/ }).first().click()
    await expect(page.getByRole('heading', { name: 'Archive Lifecycle Matter' })).toBeVisible()
    await page.getByRole('button', { name: 'Archive' }).click()
    await expect(page.getByRole('heading', { name: 'Matters', exact: true })).toBeVisible()
    await expect(page.getByText('Archive Lifecycle Matter')).toHaveCount(0)

    await page.getByRole('link', { name: 'Today' }).click()
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
    await expect(page.getByText('File pack today')).toHaveCount(0)
    await expect(page.getByText('Archive Lifecycle Matter')).toHaveCount(0)
    await expect(page.getByText('Subsidy confirmation')).toHaveCount(0)

    await page.getByRole('link', { name: 'Waiting', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Waiting' })).toBeVisible()
    await expect(page.getByText('Subsidy confirmation')).toHaveCount(0)
    await expect(page.getByText('Archive Lifecycle Matter')).toHaveCount(0)

    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Matters', exact: true })).toBeVisible()
    await page.locator('#status-filter').selectOption('archived')
    await page.getByRole('link', { name: /Archive Lifecycle Matter/ }).click()
    await expect(page.getByRole('heading', { name: 'Archive Lifecycle Matter' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()
    await expect(page.getByText('File pack today', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Subsidy confirmation', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()

    await page.getByRole('link', { name: 'Today' }).click()
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
    await expect(page.getByText('File pack today', { exact: true })).toBeVisible()
    await expect(page.getByText(/Subsidy confirmation/)).toBeVisible()
    await page.getByRole('link', { name: 'Waiting', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Waiting' })).toBeVisible()
    await expect(page.getByText('Subsidy confirmation', { exact: true })).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})

test('action notes keep line breaks after save and reopen', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-notes-'))
  let app = await launch(userData)
  const notes = 'First paragraph.\n\nSecond paragraph.\n- A\n- B'
  try {
    let page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('Notes Fidelity Matter')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()

    await page.getByRole('button', { name: '+ Action' }).click()
    const create = page.getByRole('dialog', { name: 'New action' })
    await create.getByLabel('Title').fill('Send supporting documents')
    await create.getByLabel('Notes').fill(notes)
    await create.getByRole('button', { name: 'Save' }).click()

    await page.getByRole('button', { name: 'Item actions' }).first().click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit action' }).getByLabel('Notes')).toHaveValue(notes)
    await page.getByRole('dialog', { name: 'Edit action' }).getByRole('button', { name: 'Cancel' }).click()

    await app.close()
    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.getByText('Notes Fidelity Matter').click()
    await page.getByRole('button', { name: 'Item actions' }).first().click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit action' }).getByLabel('Notes')).toHaveValue(notes)
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})
