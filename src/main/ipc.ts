import { ipcMain } from 'electron'
import { AppError, USER_ERRORS, toUserError } from '@shared/errors'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  CreateContactInput,
  CreateMatterInput,
  CreateOrganisationInput,
  IpcResult,
  LinkMatterContactInput,
  MatterListQuery,
  UpdateContactInput,
  UpdateMatterInput,
  UpdateOrganisationInput
} from '@shared/types'
import { DatabaseStore, contacts, listTags, matters, organisations } from './db/store'

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
    return { ok: false, error: message }
  }
}

export function registerIpc(store: DatabaseStore): void {
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
}
