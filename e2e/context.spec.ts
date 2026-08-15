import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

async function matterIdFromPage(page: Page): Promise<string> {
  const url = page.url()
  const id = url.split('/').pop()
  if (!id) throw new Error(`No matter id in ${url}`)
  return id
}

test('prepare context preview, privacy-safe redaction and source integrity', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'matterdock-context-e2e-'))
  const files = mkdtempSync(join(tmpdir(), 'matterdock-context-src-'))
  const letter = join(files, 'subsidy-confirmation.pdf')
  writeFileSync(letter, 'PDF')
  const app = await launch(userData)

  try {
    const page = await firstWindow(app)
    await page.getByRole('link', { name: 'Matters', exact: true }).click()
    await page.locator('header').getByRole('button', { name: 'New Matter' }).click()
    await page.getByRole('dialog', { name: 'New matter' }).getByLabel('Title').fill('EMPF Subsidy Application')
    await page.getByRole('dialog', { name: 'New matter' }).getByRole('button', { name: 'Create matter' }).click()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
    const matterId = await matterIdFromPage(page)

    await page.evaluate(
      async ({ matterId: id, letterPath }) => {
        const api = (
          window as unknown as {
            matterdock: {
              organisations: { create: (input: { name: string }) => Promise<{ ok: boolean; data?: { id: string } }> }
              contacts: {
                create: (input: {
                  name: string
                  email?: string
                  phone?: string
                  organisationId?: string
                }) => Promise<{ ok: boolean; data?: { id: string } }>
              }
              matters: {
                update: (id: string, input: { reference?: string; organisationId?: string }) => Promise<unknown>
                linkContact: (input: { matterId: string; contactId: string; role?: string }) => Promise<unknown>
              }
              tasks: {
                createAction: (input: { matterId: string; title: string; setAsNextAction?: boolean }) => Promise<unknown>
                createWaiting: (input: { matterId: string; title: string; waitingForContactId: string }) => Promise<unknown>
              }
              events: {
                create: (input: {
                  matterId: string
                  type: string
                  direction?: string
                  body?: string
                  contactId?: string
                  email?: { subject: string }
                }) => Promise<unknown>
              }
              documents: { addReference: (input: { matterId: string; path: string }) => Promise<unknown> }
            }
          }
        ).matterdock

        const org = await api.organisations.create({ name: 'eMPF Platform Company Limited' })
        if (!org.ok || !org.data) throw new Error('org create failed')
        const contact = await api.contacts.create({
          name: 'Ms Chan',
          email: 'chan@example.com',
          phone: '9123 4567',
          organisationId: org.data.id
        })
        if (!contact.ok || !contact.data) throw new Error('contact create failed')
        await api.matters.update(id, { reference: 'EMPF-2026-00123', organisationId: org.data.id })
        await api.matters.linkContact({ matterId: id, contactId: contact.data.id, role: 'Case Officer' })
        await api.tasks.createAction({ matterId: id, title: 'Send supporting documents', setAsNextAction: true })
        await api.tasks.createWaiting({
          matterId: id,
          title: 'Confirmation of subsidy amount',
          waitingForContactId: contact.data.id
        })
        await api.events.create({
          matterId: id,
          type: 'email',
          direction: 'incoming',
          contactId: contact.data.id,
          body: 'Please provide the employee records to chan@example.com.',
          email: { subject: 'Request for supporting documents' }
        })
        await api.documents.addReference({ matterId: id, path: letterPath })
      },
      { matterId, letterPath: letter }
    )
    await page.reload()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
    await expect(page.getByText('Ms Chan').first()).toBeVisible()

    await page.getByRole('button', { name: 'Prepare Context' }).click()
    const dialog = page.getByRole('dialog', { name: 'Prepare Context' })
    await expect(dialog).toBeVisible()
    const preview = dialog.locator('.context-preview-body')
    await expect(preview).toContainText('EMPF Subsidy Application')
    await expect(preview).toContainText('Ms Chan')
    await expect(preview).toContainText('Send supporting documents')
    await expect(preview).toContainText('Confirmation of subsidy amount')
    await expect(preview).toContainText('Request for supporting documents')
    await expect(preview).toContainText('subsidy-confirmation.pdf')
    await expect(preview).not.toContainText('C:\\')

    await dialog.getByLabel('Preset').selectOption('privacy_safe')
    await expect(preview).toContainText('[Contact 1]')
    await expect(preview).not.toContainText('Ms Chan')
    await expect(preview).not.toContainText('chan@example.com')
    await expect(preview).not.toContainText('9123 4567')
    await expect(preview).not.toContainText('EMPF-2026-00123')
    await expect(preview).toContainText('[Email 1]')
    await expect(preview).toContainText('[Matter Reference]')

    await dialog.getByRole('checkbox', { name: 'Contacts', exact: true }).uncheck()
    await expect(preview).not.toContainText('## Contacts')
    await expect(preview).toContainText('## Timeline')
    await expect(preview).not.toContainText('Ms Chan')
    await expect(preview).not.toContainText('chan@example.com')
    await expect(preview).toContainText('[Contact 1]')
    await expect(preview).toContainText('[Email 1]')

    await dialog.getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByText('Copied', { exact: true })).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'EMPF Subsidy Application' })).toBeVisible()
    await expect(page.getByText('Ms Chan').first()).toBeVisible()
    await expect(page.getByLabel('Reference')).toHaveValue('EMPF-2026-00123')
    await expect(page.getByText('chan@example.com')).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true })
    rmSync(files, { recursive: true, force: true })
  }
})
