import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
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

test('language switch, persistence, navigation and backup stay data-safe', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-i18n-e2e-'))
  const backupDir = mkdtempSync(join(tmpdir(), 'matterdock-i18n-backup-'))
  const backupPath = join(backupDir, 'MatterDock-test.matterdock-backup')
  let app = await launch(userData)

  try {
    await app.evaluate(async ({ dialog }, savePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath })
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savePath] })
    }, backupPath)

    let page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('EMPF Subsidy Application')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByLabel('Language').selectOption('zh-HK')
    await expect(page.getByRole('link', { name: '今日', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '事項', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '等待中', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '搜尋', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '機構', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '聯絡人', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '設定', exact: true })).toBeVisible()

    await page.getByRole('link', { name: '事項', exact: true }).click()
    await expect(page.getByText('EMPF Subsidy Application')).toBeVisible()

    await page.getByRole('link', { name: '今日', exact: true }).click()
    await expect(page.getByRole('heading', { name: '今日', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '等待中', exact: true }).click()
    await expect(page.getByRole('heading', { name: '等待中', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '搜尋', exact: true }).click()
    await expect(page.getByRole('heading', { name: '搜尋', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '機構', exact: true }).click()
    await expect(page.getByRole('heading', { name: '機構', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '聯絡人', exact: true }).click()
    await expect(page.getByRole('heading', { name: '聯絡人', exact: true })).toBeVisible()

    await page.getByRole('link', { name: '設定', exact: true }).click()
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '資料與備份', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '建立備份…' })).toBeVisible()
    await expect(page.getByRole('button', { name: '從備份復原…' })).toBeVisible()
    await expect(page.getByRole('button', { name: '匯出資料…' })).toBeVisible()

    await page.getByRole('button', { name: '建立備份…' }).click()
    await expect(page.getByText('備份已建立。')).toBeVisible()
    expect(existsSync(backupPath)).toBe(true)

    await closeApp(app)
    app = await launch(userData)
    page = await firstWindow(app)
    await expect(page.getByRole('link', { name: '今日', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '事項', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Today', exact: true })).toHaveCount(0)

    await page.getByRole('link', { name: '事項', exact: true }).click()
    await expect(page.getByText('EMPF Subsidy Application')).toBeVisible()

    await page.getByRole('link', { name: '設定', exact: true }).click()
    await page.getByLabel('語言').selectOption('en')
    await expect(page.getByRole('link', { name: 'Today', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Matters', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await expect(page.getByText('EMPF Subsidy Application')).toBeVisible()
  } finally {
    await closeApp(app).catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
    rmSync(backupDir, { recursive: true, force: true })
  }
})
