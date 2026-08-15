import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
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

test('search page and Ctrl+K find recorded context', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-search-e2e-'))
  const files = mkdtempSync(join(tmpdir(), 'matterdock-search-src-'))
  const filePath = join(files, 'subsidy-confirmation.pdf')
  writeFileSync(filePath, 'PDF')
  const app = await launch(userData)

  try {
    const page = await firstWindow(app)
    await page.getByRole('link', { name: 'Contacts' }).click()
    await page.locator('header').getByRole('button', { name: 'New Contact' }).click()
    await page.getByLabel('Name').fill('Ms Chan')
    await page.getByRole('button', { name: 'Save' }).click()

    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('EMPF Subsidy Application')
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Reference').fill('EMPF-2026-00123')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()
    const matterId = page.url().split('/').pop() ?? ''

    await page.getByRole('button', { name: 'Add Activity' }).first().click()
    await page.getByRole('menuitem', { name: 'Note' }).click()
    await page.getByRole('dialog', { name: 'Add note' }).getByRole('textbox', { name: 'Note' }).fill('Request for supporting documents')
    await page.getByRole('dialog', { name: 'Add note' }).getByRole('button', { name: 'Save' }).click()

    await page.getByRole('button', { name: '+ Waiting' }).click()
    const waiting = page.getByRole('dialog', { name: 'New waiting item' })
    await waiting.getByPlaceholder('Search other contacts').fill('Ms Chan')
    await waiting.getByLabel('What are you waiting for?').fill('Confirmation of subsidy amount')
    await waiting.getByRole('button', { name: 'Save' }).click()

    await page.evaluate(
      async ({ matterId: id, path }) => {
        const api = (window as unknown as { matterdock: { documents: { addReference: (input: { matterId: string; path: string }) => Promise<unknown> } } }).matterdock
        await api.documents.addReference({ matterId: id, path })
      },
      { matterId, path: filePath }
    )

    await page.getByRole('link', { name: 'Search' }).click()
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()
    await page.getByLabel('Search MatterDock').fill('Ms Chan')
    await expect(page.getByText('Ms Chan').first()).toBeVisible()
    await page.getByLabel('Search MatterDock').fill('supporting documents')
    await expect(page.getByText(/Request for supporting documents|supporting documents/).first()).toBeVisible()
    await page.getByLabel('Search MatterDock').fill('subsidy-confirmation')
    await expect(page.getByText('subsidy-confirmation.pdf', { exact: true }).first()).toBeVisible()
    await page.getByLabel('Search MatterDock').fill('EMPF')
    await expect(page.getByText('EMPF Subsidy Application').first()).toBeVisible()

    await page.keyboard.press('Control+k')
    const overlay = page.getByRole('dialog', { name: 'Search MatterDock' })
    await expect(overlay).toBeVisible()
    await overlay.getByLabel('Search MatterDock').fill('EMPF Subsidy')
    await expect(overlay.getByText('EMPF Subsidy Application').first()).toBeVisible()
    await overlay.getByText('EMPF Subsidy Application').first().click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
    rmSync(files, { recursive: true, force: true })
  }
})

test('organisation alias search finds the related matter', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-alias-e2e-'))
  const app = await launch(userData)
  try {
    const page = await firstWindow(app)
    await page.evaluate(async () => {
      const api = (
        window as unknown as {
          matterdock: {
            organisations: {
              create: (input: { name: string }) => Promise<{ ok: boolean; data?: { id: string }; error?: string }>
              addAlias: (organisationId: string, alias: string) => Promise<unknown>
            }
            matters: {
              create: (input: { title: string; organisationId: string }) => Promise<unknown>
            }
          }
        }
      ).matterdock
      const org = await api.organisations.create({ name: 'CLP Power Hong Kong Limited' })
      if (!org.ok || !org.data) throw new Error(org.error ?? 'org create failed')
      await api.organisations.addAlias(org.data.id, '中電')
      await api.matters.create({ title: 'Electricity Account Termination', organisationId: org.data.id })
    })

    await page.getByRole('link', { name: 'Search' }).click()
    await page.getByLabel('Search MatterDock').fill('中電')
    await expect(page.getByText('Electricity Account Termination').first()).toBeVisible()
    await expect(page.getByText('CLP Power Hong Kong Limited').first()).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})
