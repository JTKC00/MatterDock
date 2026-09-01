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

test('timeline events persist, edit and delete across relaunch', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-timeline-'))
  let app = await launch(userData)

  try {
    let page = await firstWindow(app)

    await page.getByRole('link', { name: 'Contacts' }).click()
    await page.locator('header').getByRole('button', { name: 'New Contact' }).click()
    await page.getByLabel('Name').fill('Ms Chan')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Ms Chan' })).toBeVisible()

    await page.getByRole('link', { name: 'Matters' }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    const matterDialog = page.getByRole('dialog', { name: 'New matter' })
    await matterDialog.getByLabel('Title').fill('EMPF Subsidy Application')
    await matterDialog.getByRole('button', { name: 'Create matter' }).click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()

    await page.getByRole('button', { name: 'Add Activity' }).first().click()
    await page.getByRole('menuitem', { name: 'Note' }).click()
    const noteDialog = page.getByRole('dialog', { name: 'Add note' })
    await noteDialog.getByRole('textbox', { name: 'Note' }).fill('Prepared salary supporting documents.')
    await noteDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Prepared salary supporting documents.')).toBeVisible()

    await page.getByRole('button', { name: 'Add Activity' }).first().click()
    await page.getByRole('menuitem', { name: 'Phone Call' }).click()
    const phoneDialog = page.getByRole('dialog', { name: 'Add phone call' })
    await phoneDialog.getByPlaceholder('Search other contacts').fill('Ms Chan')
    await page.getByRole('option', { name: 'Ms Chan' }).click()
    await phoneDialog.getByLabel('Notes').fill('Confirmed that supporting documents can be submitted by email.')
    await phoneDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Outgoing call')).toBeVisible()

    await page.getByRole('button', { name: 'Add Activity' }).first().click()
    await page.getByRole('menuitem', { name: 'Email' }).click()
    const emailDialog = page.getByRole('dialog', { name: 'Add email' })
    await emailDialog.getByLabel('Received').check()
    await emailDialog.getByLabel('Subject').fill('Request for additional documents')
    await emailDialog.getByLabel('Body').fill('Please provide the employee records.')
    await emailDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Email received')).toBeVisible()
    await expect(page.getByText('Request for additional documents')).toBeVisible()

    await app.close()
    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters' }).click()
    await page.getByText('EMPF Subsidy Application').click()
    await expect(page.getByText('Outgoing call')).toBeVisible()
    await expect(page.getByText('Email received')).toBeVisible()
    await expect(page.getByText('Prepared salary supporting documents.')).toBeVisible()
    await expect(page.getByText('Request for additional documents')).toBeVisible()
    await expect(page.getByText('Ms Chan').first()).toBeVisible()

    await page.getByRole('button', { name: 'Activity actions' }).nth(2).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit note' })
    await editDialog.getByRole('textbox', { name: 'Note' }).fill('Prepared salary supporting documents and signed copies.')
    await editDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Prepared salary supporting documents and signed copies.')).toBeVisible()

    await app.close()
    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters' }).click()
    await page.getByText('EMPF Subsidy Application').click()
    await expect(page.getByText('Prepared salary supporting documents and signed copies.')).toBeVisible()

    await page.getByRole('button', { name: 'Activity actions' }).nth(2).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog', { name: 'Delete this activity?' }).getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Prepared salary supporting documents and signed copies.')).toHaveCount(0)

    await app.close()
    app = await launch(userData)
    page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters' }).click()
    await page.getByText('EMPF Subsidy Application').click()
    await expect(page.getByText('Outgoing call')).toBeVisible()
    await expect(page.getByText('Email received')).toBeVisible()
    await expect(page.getByText('Prepared salary supporting documents and signed copies.')).toHaveCount(0)
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})

test('timeline note rejects an empty date instead of inventing now', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-date-'))
  const app = await launch(userData)
  try {
    const page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('Datetime Integrity Matter')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()

    await page.getByRole('button', { name: 'Add Activity' }).first().click()
    await page.getByRole('menuitem', { name: 'Note' }).click()
    const noteDialog = page.getByRole('dialog', { name: 'Add note' })
    await noteDialog.getByRole('textbox', { name: 'Note' }).fill('Should not invent a timestamp.')
    await noteDialog.getByLabel('Date & time').fill('')
    await noteDialog.getByRole('button', { name: 'Save' }).click()
    await expect(noteDialog.getByText(/date and time/i)).toBeVisible()
    await noteDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Should not invent a timestamp.')).toHaveCount(0)
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})
