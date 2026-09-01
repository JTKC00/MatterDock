import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

async function createMatter(page: Page, title: string): Promise<string> {
  await page.getByRole('link', { name: 'Matters', exact: true }).click()
  await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
  const dialog = page.getByRole('dialog', { name: 'New matter' })
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('button', { name: 'Create matter' }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const id = page.url().split('/').pop()
  if (!id) throw new Error(`No matter id in ${page.url()}`)
  return id
}

async function expectMainFocus(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName === 'MAIN')).toBe(true)
  await expect(page.locator('main')).toHaveAttribute('tabindex', '-1')
}

test('organisation and contact deletion require explicit confirmation', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-delete-confirmation-e2e-'))
  const app = await launch(userData)

  try {
    const page = await firstWindow(app)
    await page.evaluate(async () => {
      const api = (
        window as unknown as {
          matterdock: {
            organisations: { create: (input: { name: string }) => Promise<{ ok: boolean; data?: { id: string } }> }
            contacts: { create: (input: { name: string; organisationId?: string }) => Promise<{ ok: boolean; data?: { id: string } }> }
          }
        }
      ).matterdock
      const organisation = await api.organisations.create({ name: 'UX Delete Organisation' })
      if (!organisation.ok || !organisation.data) throw new Error('organisation create failed')
      const contact = await api.contacts.create({ name: 'UX Delete Contact', organisationId: organisation.data.id })
      if (!contact.ok || !contact.data) throw new Error('contact create failed')
    })

    await page.getByRole('link', { name: 'Organisations', exact: true }).click()
    await page.getByText('UX Delete Organisation', { exact: true }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    const organisationDialog = page.getByRole('dialog', { name: 'Delete this organisation?' })
    await expect(organisationDialog).toContainText('UX Delete Organisation')
    await organisationDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(organisationDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'UX Delete Organisation', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog', { name: 'Delete this organisation?' }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Organisations', exact: true })).toBeVisible()
    await expect(page.getByText('UX Delete Organisation', { exact: true })).toHaveCount(0)

    await page.getByRole('link', { name: 'Contacts', exact: true }).click()
    await page.getByText('UX Delete Contact', { exact: true }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    const contactDialog = page.getByRole('dialog', { name: 'Delete this contact?' })
    await expect(contactDialog).toContainText('UX Delete Contact')
    await contactDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(contactDialog).toBeHidden()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog', { name: 'Delete this contact?' }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Contacts', exact: true })).toBeVisible()
    await expect(page.getByText('UX Delete Contact', { exact: true })).toHaveCount(0)

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByLabel('Language').selectOption('zh-HK')
    await page.evaluate(async () => {
      const api = (
        window as unknown as {
          matterdock: {
            organisations: { create: (input: { name: string }) => Promise<{ ok: boolean; data?: { id: string } }> }
            contacts: { create: (input: { name: string }) => Promise<{ ok: boolean; data?: { id: string } }> }
          }
        }
      ).matterdock
      const organisation = await api.organisations.create({ name: 'UX 中文刪除機構' })
      if (!organisation.ok || !organisation.data) throw new Error('zh-HK organisation create failed')
      const contact = await api.contacts.create({ name: 'UX 中文刪除聯絡人' })
      if (!contact.ok || !contact.data) throw new Error('zh-HK contact create failed')
    })
    await page.reload()
    await expect(page.getByRole('link', { name: '機構', exact: true })).toBeVisible()

    await page.getByRole('link', { name: '機構', exact: true }).click()
    await page.getByText('UX 中文刪除機構', { exact: true }).click()
    await page.getByRole('button', { name: '刪除', exact: true }).click()
    const zhOrganisationDialog = page.getByRole('dialog', { name: '刪除此機構？' })
    await expect(zhOrganisationDialog).toContainText('UX 中文刪除機構')
    await zhOrganisationDialog.getByRole('button', { name: '取消' }).click()
    await expect(zhOrganisationDialog).toBeHidden()

    await page.getByRole('link', { name: '聯絡人', exact: true }).click()
    await page.getByText('UX 中文刪除聯絡人', { exact: true }).click()
    await page.getByRole('button', { name: '刪除', exact: true }).click()
    const zhContactDialog = page.getByRole('dialog', { name: '刪除此聯絡人？' })
    await expect(zhContactDialog).toContainText('UX 中文刪除聯絡人')
    await zhContactDialog.getByRole('button', { name: '取消' }).click()
    await expect(zhContactDialog).toBeHidden()
  } finally {
    await closeApp(app).catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})

test('toasts stay bounded, dismissible, deduplicated for success, and preserve repeated errors', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-toast-e2e-'))
  const app = await launch(userData)

  try {
    const page = await firstWindow(app)
    await page.getByRole('link', { name: 'Organisations', exact: true }).click()

    for (const name of ['UX Toast One', 'UX Toast Two', 'UX Toast Three', 'UX Toast Four']) {
      await page.locator('header').getByRole('button', { name: 'New Organisation' }).click()
      const dialog = page.getByRole('dialog', { name: 'New organisation' })
      await dialog.getByLabel('Canonical name').fill(name)
      await dialog.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
      await page.getByRole('link', { name: 'Organisations', exact: true }).click()
    }

    const toasts = page.locator('.toast')
    await expect(toasts).toHaveCount(1)
    await expect(toasts).toContainText('Organisation created.')
    await expect(page.getByRole('button', { name: 'Dismiss notification' })).toHaveCount(1)

    await page.getByRole('button', { name: 'Dismiss notification' }).click()
    await expect(toasts).toHaveCount(0)

    await page.getByText('UX Toast Four', { exact: true }).click()
    await page.getByLabel('New alias').fill('repeated-alias')
    await page.getByRole('button', { name: 'Add Alias' }).click()
    await expect(toasts).toContainText('Alias added.')

    await page.getByLabel('New alias').fill('repeated-alias')
    await page.getByRole('button', { name: 'Add Alias' }).click()
    await expect(toasts.filter({ hasText: 'This organisation already has that alias.' })).toHaveCount(1)
    await page.getByLabel('New alias').fill('repeated-alias')
    await page.getByRole('button', { name: 'Add Alias' }).click()
    await expect(toasts.filter({ hasText: 'This organisation already has that alias.' })).toHaveCount(2)
    await expect(toasts).toHaveCount(3)

    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    const matterDialog = page.getByRole('dialog', { name: 'New matter' })
    await expect(matterDialog).toBeVisible()
    await matterDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(matterDialog).toBeHidden()
  } finally {
    await closeApp(app).catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})

test('long document paths remain contained at the supported narrow viewport', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-document-layout-e2e-'))
  const files = mkdtempSync(join(tmpdir(), 'matterdock-document-source-e2e-'))
  const fileName = 'supporting-document-with-an-exceptionally-long-file-name-for-responsive-testing.pdf'
  const filePath = join(files, fileName)
  writeFileSync(filePath, 'PDF')
  const app = await launch(userData)

  try {
    const page = await firstWindow(app)
    const matterId = await createMatter(page, 'UX Long Document Matter')
    await page.evaluate(async ({ id, path }) => {
      const api = (
        window as unknown as {
          matterdock: { documents: { addReference: (input: { matterId: string; path: string }) => Promise<{ ok: boolean; error?: string }> } }
        }
      ).matterdock
      const result = await api.documents.addReference({ matterId: id, path })
      if (!result.ok) throw new Error(result.error ?? 'document reference failed')
    }, { id: matterId, path: filePath })

    await page.setViewportSize({ width: 980, height: 680 })
    await page.reload()
    await expect(page.getByText(fileName, { exact: true })).toBeVisible()
    const path = page.locator('.doc-path')
    await expect(path).toHaveAttribute('title', filePath)
    const metrics = await page.locator('.matter-main').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      pathClientWidth: element.querySelector('.doc-path')?.clientWidth ?? 0,
      pathScrollWidth: element.querySelector('.doc-path')?.scrollWidth ?? 0
    }))
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
    expect(metrics.pathScrollWidth).toBeGreaterThan(metrics.pathClientWidth)
  } finally {
    await closeApp(app).catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
    rmSync(files, { recursive: true, force: true })
  }
})

test('navigation exposes localized landmark, moves focus, shows Today empty state, and keeps organisation names keyboard accessible', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-navigation-e2e-'))
  const app = await launch(userData)

  try {
    const page = await firstWindow(app)
    await expect(page.locator('nav.nav')).toHaveAttribute('aria-label', 'Primary navigation')

    await page.getByRole('link', { name: 'Today', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    await expectMainFocus(page)
    await expect(page.getByText('No recent matters yet.', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View matters', exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expectMainFocus(page)
    await page.getByLabel('Language').selectOption('zh-HK')
    await expect(page.locator('nav.nav')).toHaveAttribute('aria-label', '主要導覽')

    await page.getByRole('link', { name: '今日', exact: true }).click()
    await expect(page.getByRole('heading', { name: '今日', exact: true })).toBeVisible()
    await expectMainFocus(page)
    await expect(page.getByText('暫時沒有最近事項。', { exact: true })).toBeVisible()

    await page.evaluate(async () => {
      const api = (
        window as unknown as {
          matterdock: { organisations: { create: (input: { name: string }) => Promise<{ ok: boolean; data?: { id: string } }> } }
        }
      ).matterdock
      const result = await api.organisations.create({ name: 'UX Keyboard Organisation' })
      if (!result.ok || !result.data) throw new Error('organisation create failed')
    })
    await page.getByRole('link', { name: '事項', exact: true }).click()
    await page.locator('header').getByRole('button', { name: '新增事項' }).click()
    const matterDialog = page.getByRole('dialog', { name: '新增事項' })
    await matterDialog.getByLabel('標題').fill('UX Combobox Matter')
    await matterDialog.getByRole('button', { name: '建立事項' }).click()
    await expect(page.getByRole('heading', { name: 'UX Combobox Matter', exact: true })).toBeVisible()
    await expect(page.locator('.sr-only')).toHaveCount(0)

    const organisationInput = page.getByPlaceholder('搜尋機構')
    await expect(organisationInput).toHaveValue('')
    await organisationInput.focus()
    await organisationInput.press('ArrowDown')
    await expect(page.getByRole('option', { name: 'UX Keyboard Organisation' })).toBeVisible()
    await organisationInput.press('Enter')
    await expect(organisationInput).toHaveValue('UX Keyboard Organisation')
    await expect(page.locator('.sr-only')).toHaveCount(0)
  } finally {
    await closeApp(app).catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})
