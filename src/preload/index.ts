import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type MatterDockApi } from '@shared/ipc'

const api: MatterDockApi = {
  matters: {
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.mattersList, query),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.mattersGet, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.mattersCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.mattersUpdate, id, input),
    archive: (id) => ipcRenderer.invoke(IPC_CHANNELS.mattersArchive, id),
    restore: (id) => ipcRenderer.invoke(IPC_CHANNELS.mattersRestore, id),
    setTags: (id, tagNames) => ipcRenderer.invoke(IPC_CHANNELS.mattersSetTags, id, tagNames),
    linkContact: (input) => ipcRenderer.invoke(IPC_CHANNELS.mattersLinkContact, input),
    unlinkContact: (matterId, contactId) =>
      ipcRenderer.invoke(IPC_CHANNELS.mattersUnlinkContact, matterId, contactId)
  },
  organisations: {
    list: (search) => ipcRenderer.invoke(IPC_CHANNELS.organisationsList, search),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.organisationsGet, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.organisationsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.organisationsUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.organisationsRemove, id),
    addAlias: (organisationId, alias) =>
      ipcRenderer.invoke(IPC_CHANNELS.organisationsAddAlias, organisationId, alias),
    removeAlias: (aliasId) => ipcRenderer.invoke(IPC_CHANNELS.organisationsRemoveAlias, aliasId),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.organisationsSearch, query)
  },
  contacts: {
    list: (search) => ipcRenderer.invoke(IPC_CHANNELS.contactsList, search),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.contactsGet, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.contactsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.contactsUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.contactsRemove, id),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.contactsSearch, query)
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.tagsList)
  }
}

contextBridge.exposeInMainWorld('matterdock', api)
