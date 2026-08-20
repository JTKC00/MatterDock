import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { AppError, USER_ERRORS, toUserError } from '@shared/errors'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  AttachDocumentInput,
  ContextOptions,
  ContextSaveInput,
  CreateActionInput,
  CreateContactInput,
  CreateEventInput,
  CreateMatterInput,
  CreateOrganisationInput,
  CreateWaitingInput,
  IpcResult,
  LinkMatterContactInput,
  MatterListQuery,
  RelinkDocumentInput,
  UpdateContactInput,
  UpdateDocumentInput,
  UpdateMatterInput,
  UpdateEventInput,
  UpdateOrganisationInput,
  UpdateWorkItemInput
} from '@shared/types'
import { BACKUP_FILE_EXTENSION } from '@shared/backup'
import { isSupportedLocale, translate, type SupportedLocale } from '@shared/i18n'
import { buildMatterContext } from './context/build'
import { createDocumentService } from './documents/service'
import { DatabaseStore, contacts, events, listTags, matters, organisations, search, tasks } from './db/store'
import { BackupWorkspace } from './backup/workspace'

function wrap<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() }
  } catch (error) {
    const message = toUserError(error, USER_ERRORS.unexpected)
    if (!(error instanceof AppError)) {
      console.error('[matterdock] ipc error', error)
    } else {
      console.error(`[matterdock] ${error.code}: ${error.message}`)
    }
    return { ok: false, error: message, code: error instanceof AppError ? error.code : undefined }
  }
}

async function wrapAsync<T>(fn: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    const message = toUserError(error, USER_ERRORS.unexpected)
    if (!(error instanceof AppError)) {
      console.error('[matterdock] ipc error', error)
    } else {
      console.error(`[matterdock] ${error.code}: ${error.message}`)
    }
    return { ok: false, error: message, code: error instanceof AppError ? error.code : undefined }
  }
}

export function registerIpc(
  store: DatabaseStore,
  options: {
    documentsRoot: string
    userData: string
    appVersion: string
    getLocale: () => SupportedLocale
    setLocale: (locale: SupportedLocale) => void
  }
): void {
  const docs = createDocumentService(store, options.documentsRoot)
  const backup = new BackupWorkspace({
    store,
    userData: options.userData,
    documentsRoot: options.documentsRoot,
    appVersion: options.appVersion
  })
  ipcMain.handle(IPC_CHANNELS.mattersList, (_event, query?: MatterListQuery) =>
    wrap(() => store.query((db) => matters.listMatters(db, query)))
  )
  ipcMain.handle(IPC_CHANNELS.mattersGet, (_event, id: string) =>
    wrap(() => store.query((db) => matters.getMatter(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.mattersCreate, (_event, input: CreateMatterInput) =>
    wrap(() => store.mutate((db) => matters.createMatter(db, input)))
  )
  ipcMain.handle(IPC_CHANNELS.mattersUpdate, (_event, id: string, input: UpdateMatterInput) =>
    wrap(() => store.mutate((db) => matters.updateMatter(db, id, input)))
  )
  ipcMain.handle(IPC_CHANNELS.mattersArchive, (_event, id: string) =>
    wrap(() => store.mutate((db) => matters.archiveMatter(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.mattersRestore, (_event, id: string) =>
    wrap(() => store.mutate((db) => matters.restoreMatter(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.mattersSetTags, (_event, id: string, tagNames: string[]) =>
    wrap(() => store.mutate((db) => matters.setMatterTags(db, id, tagNames)))
  )
  ipcMain.handle(IPC_CHANNELS.mattersLinkContact, (_event, input: LinkMatterContactInput) =>
    wrap(() => store.mutate((db) => matters.linkMatterContact(db, input)))
  )
  ipcMain.handle(IPC_CHANNELS.mattersUnlinkContact, (_event, matterId: string, contactId: string) =>
    wrap(() => store.mutate((db) => matters.unlinkMatterContact(db, matterId, contactId)))
  )

  ipcMain.handle(IPC_CHANNELS.organisationsList, (_event, search?: string) =>
    wrap(() => store.query((db) => organisations.listOrganisations(db, search)))
  )
  ipcMain.handle(IPC_CHANNELS.organisationsGet, (_event, id: string) =>
    wrap(() => store.query((db) => organisations.getOrganisation(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.organisationsCreate, (_event, input: CreateOrganisationInput) =>
    wrap(() => store.mutate((db) => organisations.createOrganisation(db, input)))
  )
  ipcMain.handle(IPC_CHANNELS.organisationsUpdate, (_event, id: string, input: UpdateOrganisationInput) =>
    wrap(() => store.mutate((db) => organisations.updateOrganisation(db, id, input)))
  )
  ipcMain.handle(IPC_CHANNELS.organisationsRemove, (_event, id: string) =>
    wrap(() => store.mutate((db) => organisations.removeOrganisation(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.organisationsAddAlias, (_event, organisationId: string, alias: string) =>
    wrap(() => store.mutate((db) => organisations.addAlias(db, organisationId, alias)))
  )
  ipcMain.handle(IPC_CHANNELS.organisationsRemoveAlias, (_event, aliasId: string) =>
    wrap(() => store.mutate((db) => organisations.removeAlias(db, aliasId)))
  )
  ipcMain.handle(IPC_CHANNELS.organisationsSearch, (_event, query: string) =>
    wrap(() => store.query((db) => organisations.searchOrganisations(db, query)))
  )

  ipcMain.handle(IPC_CHANNELS.contactsList, (_event, search?: string) =>
    wrap(() => store.query((db) => contacts.listContacts(db, search)))
  )
  ipcMain.handle(IPC_CHANNELS.contactsGet, (_event, id: string) =>
    wrap(() => store.query((db) => contacts.getContact(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.contactsCreate, (_event, input: CreateContactInput) =>
    wrap(() => store.mutate((db) => contacts.createContact(db, input)))
  )
  ipcMain.handle(IPC_CHANNELS.contactsUpdate, (_event, id: string, input: UpdateContactInput) =>
    wrap(() => store.mutate((db) => contacts.updateContact(db, id, input)))
  )
  ipcMain.handle(IPC_CHANNELS.contactsRemove, (_event, id: string) =>
    wrap(() => store.mutate((db) => contacts.removeContact(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.contactsSearch, (_event, query: string) =>
    wrap(() => store.query((db) => contacts.searchContacts(db, query)))
  )

  ipcMain.handle(IPC_CHANNELS.tagsList, () => wrap(() => store.query((db) => listTags(db))))

  ipcMain.handle(IPC_CHANNELS.eventsList, (_event, matterId: string) =>
    wrap(() => store.query((db) => events.listEventsForMatter(db, matterId)))
  )
  ipcMain.handle(IPC_CHANNELS.eventsGet, (_event, id: string) =>
    wrap(() => store.query((db) => events.getEvent(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.eventsCreate, (_event, input: CreateEventInput) =>
    wrap(() => store.mutate((db) => events.createEvent(db, input)))
  )
  ipcMain.handle(IPC_CHANNELS.eventsUpdate, (_event, id: string, input: UpdateEventInput) =>
    wrap(() => store.mutate((db) => events.updateEvent(db, id, input)))
  )
  ipcMain.handle(IPC_CHANNELS.eventsRemove, (_event, id: string) =>
    wrap(() => store.mutate((db) => events.deleteEvent(db, id)))
  )

  ipcMain.handle(IPC_CHANNELS.tasksListForMatter, (_event, matterId: string) =>
    wrap(() => store.query((db) => tasks.listItemsForMatter(db, matterId)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksGet, (_event, id: string) =>
    wrap(() => store.query((db) => tasks.getTask(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksNext, (_event, matterId: string) =>
    wrap(() => store.query((db) => tasks.getNextActionForMatter(db, matterId)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksCreateAction, (_event, input: CreateActionInput) =>
    wrap(() => store.mutate((db) => tasks.createAction(db, input)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksCreateWaiting, (_event, input: CreateWaitingInput) =>
    wrap(() => store.mutate((db) => tasks.createWaiting(db, input)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksUpdate, (_event, id: string, input: UpdateWorkItemInput) =>
    wrap(() => store.mutate((db) => tasks.updateTask(db, id, input)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksComplete, (_event, id: string) =>
    wrap(() => store.mutate((db) => tasks.completeAction(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksResolve, (_event, id: string) =>
    wrap(() => store.mutate((db) => tasks.resolveWaiting(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksCancel, (_event, id: string) =>
    wrap(() => store.mutate((db) => tasks.cancelTask(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksReopen, (_event, id: string) =>
    wrap(() => store.mutate((db) => tasks.reopenTask(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksSetNext, (_event, id: string) =>
    wrap(() => store.mutate((db) => tasks.setNextAction(db, id)))
  )
  ipcMain.handle(IPC_CHANNELS.tasksClearNext, (_event, matterId: string) =>
    wrap(() =>
      store.mutate((db) => {
        tasks.clearNextAction(db, matterId)
        return { matterId }
      })
    )
  )
  ipcMain.handle(IPC_CHANNELS.tasksListWaiting, () => wrap(() => store.query((db) => tasks.listWaiting(db))))
  ipcMain.handle(IPC_CHANNELS.tasksToday, () => wrap(() => store.query((db) => tasks.getTodayDashboard(db))))

  ipcMain.handle(IPC_CHANNELS.documentsListForMatter, (_event, matterId: string) =>
    wrap(() => docs.listForMatter(matterId))
  )
  ipcMain.handle(IPC_CHANNELS.documentsPick, (event) =>
    wrapAsync(() => docs.pick(BrowserWindow.fromWebContents(event.sender)))
  )
  ipcMain.handle(IPC_CHANNELS.documentsAddReference, (_event, input: AttachDocumentInput) =>
    wrap(() => docs.addReference(input))
  )
  ipcMain.handle(IPC_CHANNELS.documentsAddCopy, (_event, input: AttachDocumentInput) =>
    wrap(() => docs.addCopy(input))
  )
  ipcMain.handle(IPC_CHANNELS.documentsOpen, (_event, id: string) => wrapAsync(() => docs.open(id)))
  ipcMain.handle(IPC_CHANNELS.documentsReveal, (_event, id: string) => wrap(() => docs.reveal(id)))
  ipcMain.handle(IPC_CHANNELS.documentsRelink, (_event, id: string, input: RelinkDocumentInput) =>
    wrap(() => docs.relink(id, input))
  )
  ipcMain.handle(IPC_CHANNELS.documentsUpdate, (_event, id: string, input: UpdateDocumentInput) =>
    wrap(() => docs.update(id, input))
  )
  ipcMain.handle(IPC_CHANNELS.documentsRemove, (_event, id: string) => wrap(() => docs.remove(id)))

  ipcMain.handle(IPC_CHANNELS.searchGlobal, (_event, query: string) =>
    wrap(() => store.query((db) => search.globalSearch(db, query, options.documentsRoot)))
  )

  ipcMain.handle(IPC_CHANNELS.contextBuild, (_event, matterId: string, input: ContextOptions) =>
    wrap(() => store.query((db) => buildMatterContext(db, matterId, input, options.documentsRoot)))
  )
  ipcMain.handle(IPC_CHANNELS.contextCopy, (_event, text: string) =>
    wrap(() => {
      clipboard.writeText(String(text ?? ''))
      return { copied: true as const }
    })
  )
  ipcMain.handle(IPC_CHANNELS.contextSave, (event, input: ContextSaveInput) =>
    wrapAsync(async () => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const ext = input.format === 'json' ? 'json' : input.format === 'text' ? 'txt' : 'md'
      const result = window
        ? await dialog.showSaveDialog(window, {
            defaultPath: input.suggestedName,
            filters: [{ name: 'Context', extensions: [ext] }]
          })
        : await dialog.showSaveDialog({
            defaultPath: input.suggestedName,
            filters: [{ name: 'Context', extensions: [ext] }]
          })
      if (result.canceled || !result.filePath) return { saved: false }
      try {
        writeFileSync(result.filePath, input.content, 'utf8')
        return { saved: true }
      } catch (error) {
        throw new AppError(USER_ERRORS.contextSaveFailed, 'CONTEXT_SAVE_FAILED', { cause: error })
      }
    })
  )

  ipcMain.handle(IPC_CHANNELS.backupCreate, (event) =>
    wrapAsync(async () => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const defaultPath = `MatterDock-${todayStamp()}.${BACKUP_FILE_EXTENSION}`
      const locale = options.getLocale()
      const result = window
        ? await dialog.showSaveDialog(window, {
            title: translate(locale, 'native.backupSaveTitle'),
            defaultPath,
            filters: [{ name: translate(locale, 'native.backupFilter'), extensions: [BACKUP_FILE_EXTENSION] }]
          })
        : await dialog.showSaveDialog({
            title: translate(locale, 'native.backupSaveTitle'),
            defaultPath,
            filters: [{ name: translate(locale, 'native.backupFilter'), extensions: [BACKUP_FILE_EXTENSION] }]
          })
      if (result.canceled || !result.filePath) return { created: false as const }
      await backup.create(result.filePath)
      return { created: true as const, path: result.filePath }
    })
  )

  ipcMain.handle(IPC_CHANNELS.backupInspect, (event) =>
    wrapAsync(async () => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const locale = options.getLocale()
      const result = window
        ? await dialog.showOpenDialog(window, {
            title: translate(locale, 'native.backupOpenTitle'),
            properties: ['openFile'],
            filters: [{ name: translate(locale, 'native.backupFilter'), extensions: [BACKUP_FILE_EXTENSION] }]
          })
        : await dialog.showOpenDialog({
            title: translate(locale, 'native.backupOpenTitle'),
            properties: ['openFile'],
            filters: [{ name: translate(locale, 'native.backupFilter'), extensions: [BACKUP_FILE_EXTENSION] }]
          })
      if (result.canceled || !result.filePaths[0]) return { canceled: true as const }
      return backup.inspect(result.filePaths[0])
    })
  )

  ipcMain.handle(IPC_CHANNELS.backupRestore, (_event, token: string) =>
    wrapAsync(async () => {
      await backup.restore(String(token ?? ''))
      return { restored: true as const }
    })
  )

  ipcMain.handle(IPC_CHANNELS.backupReveal, () =>
    wrap(() => {
      const path = backup.lastBackupPath()
      if (!path || !existsSync(path)) return { revealed: false }
      shell.showItemInFolder(path)
      return { revealed: true }
    })
  )

  ipcMain.handle(IPC_CHANNELS.dataExportCreate, (event) =>
    wrapAsync(async () => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const locale = options.getLocale()
      const result = window
        ? await dialog.showOpenDialog(window, {
            title: translate(locale, 'native.exportFolderTitle'),
            properties: ['openDirectory', 'createDirectory']
          })
        : await dialog.showOpenDialog({
            title: translate(locale, 'native.exportFolderTitle'),
            properties: ['openDirectory', 'createDirectory']
          })
      if (result.canceled || !result.filePaths[0]) return { created: false as const }
      const path = await backup.exportData(result.filePaths[0])
      return { created: true as const, path }
    })
  )

  ipcMain.handle(IPC_CHANNELS.dataExportReveal, () =>
    wrap(() => {
      const path = backup.lastDataExportPath()
      if (!path || !existsSync(path)) return { revealed: false }
      shell.showItemInFolder(path)
      return { revealed: true }
    })
  )

  ipcMain.handle(IPC_CHANNELS.settingsGetLocale, () => wrap(() => ({ locale: options.getLocale() })))
  ipcMain.handle(IPC_CHANNELS.settingsSetLocale, (_event, value: string) =>
    wrap(() => {
      const locale = isSupportedLocale(value) ? value : 'en'
      options.setLocale(locale)
      return { locale }
    })
  )
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}
