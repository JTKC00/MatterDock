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
    deletePermanently: (id) => ipcRenderer.invoke(IPC_CHANNELS.mattersDeletePermanently, id),
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
  },
  events: {
    list: (matterId) => ipcRenderer.invoke(IPC_CHANNELS.eventsList, matterId),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.eventsGet, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.eventsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.eventsUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.eventsRemove, id)
  },
  tasks: {
    listForMatter: (matterId) => ipcRenderer.invoke(IPC_CHANNELS.tasksListForMatter, matterId),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksGet, id),
    next: (matterId) => ipcRenderer.invoke(IPC_CHANNELS.tasksNext, matterId),
    createAction: (input) => ipcRenderer.invoke(IPC_CHANNELS.tasksCreateAction, input),
    createWaiting: (input) => ipcRenderer.invoke(IPC_CHANNELS.tasksCreateWaiting, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.tasksUpdate, id, input),
    complete: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksComplete, id),
    resolve: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksResolve, id),
    cancel: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksCancel, id),
    reopen: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksReopen, id),
    setNext: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksSetNext, id),
    clearNext: (matterId) => ipcRenderer.invoke(IPC_CHANNELS.tasksClearNext, matterId),
    listWaiting: () => ipcRenderer.invoke(IPC_CHANNELS.tasksListWaiting),
    today: () => ipcRenderer.invoke(IPC_CHANNELS.tasksToday)
  },
  documents: {
    listForMatter: (matterId) => ipcRenderer.invoke(IPC_CHANNELS.documentsListForMatter, matterId),
    pick: () => ipcRenderer.invoke(IPC_CHANNELS.documentsPick),
    addReference: (input) => ipcRenderer.invoke(IPC_CHANNELS.documentsAddReference, input),
    addCopy: (input) => ipcRenderer.invoke(IPC_CHANNELS.documentsAddCopy, input),
    open: (id) => ipcRenderer.invoke(IPC_CHANNELS.documentsOpen, id),
    reveal: (id) => ipcRenderer.invoke(IPC_CHANNELS.documentsReveal, id),
    relink: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.documentsRelink, id, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.documentsUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.documentsRemove, id)
  },
  search: {
    global: (query) => ipcRenderer.invoke(IPC_CHANNELS.searchGlobal, query)
  },
  context: {
    build: (matterId, options) => ipcRenderer.invoke(IPC_CHANNELS.contextBuild, matterId, options),
    copy: (text) => ipcRenderer.invoke(IPC_CHANNELS.contextCopy, text),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.contextSave, input)
  },
  backup: {
    create: () => ipcRenderer.invoke(IPC_CHANNELS.backupCreate),
    inspect: () => ipcRenderer.invoke(IPC_CHANNELS.backupInspect),
    restore: (token) => ipcRenderer.invoke(IPC_CHANNELS.backupRestore, token),
    revealBackup: () => ipcRenderer.invoke(IPC_CHANNELS.backupReveal),
    exportData: () => ipcRenderer.invoke(IPC_CHANNELS.dataExportCreate),
    revealExport: () => ipcRenderer.invoke(IPC_CHANNELS.dataExportReveal)
  },
  settings: {
    getLocale: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetLocale),
    setLocale: (locale) => ipcRenderer.invoke(IPC_CHANNELS.settingsSetLocale, locale)
  }
}

contextBridge.exposeInMainWorld('matterdock', api)
