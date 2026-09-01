import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = resolve(
  process.env.MATTERDOCK_PACKAGED_EXECUTABLE ?? join(root, 'release', 'win-unpacked', 'MatterDock.exe')
)

test.skip(
  process.platform !== 'win32' || !existsSync(packagedExecutable),
  'Packaged-app smoke runs on Windows after the unpacked release build.'
)

function launch(userData: string): Promise<ElectronApplication> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>
  Object.assign(env, {
    NODE_ENV: 'production',
    MATTERDOCK_USER_DATA: userData,
    MATTERDOCK_LOCALE: 'en',
    // This must be ignored by a packaged build. Keeping it set makes the release test
    // fail if demo data can be enabled through the environment.
    MATTERDOCK_SEED: '1'
  })
  delete env.MATTERDOCK_DISABLE_SEED

  return electron.launch({
    executablePath: packagedExecutable,
    args: ['--disable-gpu', '--no-sandbox'],
    cwd: root,
    env
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
    await new Promise<void>((resolveExit) => {
      const timer = setTimeout(resolveExit, 5000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolveExit()
      })
    })
  }
}

test('packaged app loads resources, keeps data outside its install directory, and survives relaunch', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-packaged-e2e-'))
  let app = await launch(userData)

  try {
    const page = await firstWindow(app)
    const runtime = await app.evaluate(({ app: electronApp }) => ({
      packaged: electronApp.isPackaged,
      version: electronApp.getVersion(),
      userData: electronApp.getPath('userData')
    }))
    expect(runtime.packaged).toBe(true)
    expect(runtime.version).toBe('0.8.0')
    const installRelative = relative(dirname(packagedExecutable), runtime.userData)
    expect(installRelative === '' || (!installRelative.startsWith('..') && !isAbsolute(installRelative))).toBe(false)

    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await expect(page.getByText('EMPF Subsidy Application', { exact: true })).toHaveCount(0)
    await expect(page.getByText('H28/51-52 Land Resumption', { exact: true })).toHaveCount(0)

    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    const dialog = page.getByRole('dialog', { name: 'New matter' })
    await dialog.getByLabel('Title').fill('Packaged release persistence')
    await dialog.getByRole('button', { name: 'Create matter' }).click()
    await expect(page.getByRole('heading', { name: 'Packaged release persistence' })).toBeVisible()

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByLabel('Language').selectOption('zh-HK')
    await expect(page.getByRole('link', { name: '事項', exact: true })).toBeVisible()
    await page.getByLabel('語言').selectOption('en')

    await closeApp(app)
    expect(existsSync(join(userData, 'matterdock.sqlite'))).toBe(true)

    app = await launch(userData)
    const relaunched = await firstWindow(app)
    await relaunched.getByRole('link', { name: 'Matters', exact: true }).click()
    await expect(relaunched.getByText('Packaged release persistence', { exact: true })).toBeVisible()
    await expect(relaunched.getByText('EMPF Subsidy Application', { exact: true })).toHaveCount(0)
    await expect(relaunched.getByText('H28/51-52 Land Resumption', { exact: true })).toHaveCount(0)
  } finally {
    await closeApp(app).catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
  }
})
