import type {
  Contact,
  ContactDetail,
  ContactSummary,
  CreateActionInput,
  CreateContactInput,
  CreateEventInput,
  CreateMatterInput,
  CreateWaitingInput,
  CreateOrganisationInput,
  IpcResult,
  LinkMatterContactInput,
  MatterDetail,
  MatterListItem,
  MatterListQuery,
  Organisation,
  OrganisationAlias,
  OrganisationDetail,
  OrganisationSummary,
  Tag,
  TimelineEvent,
  TodayDashboard,
  UpdateContactInput,
  UpdateDocumentInput,
  UpdateEventInput,
  UpdateWorkItemInput,
  UpdateMatterInput,
  UpdateOrganisationInput,
  WaitingBoard,
  WorkItem,
  AttachDocumentInput,
  MatterDocument,
  PickedFile,
  RelinkDocumentInput,
  SearchResponse,
  ContextExport,
  ContextOptions,
  ContextSaveInput
} from './types'

export type MatterDockApi = {
  matters: {
    list: (query?: MatterListQuery) => Promise<IpcResult<MatterListItem[]>>
    get: (id: string) => Promise<IpcResult<MatterDetail>>
    create: (input: CreateMatterInput) => Promise<IpcResult<MatterDetail>>
    update: (id: string, input: UpdateMatterInput) => Promise<IpcResult<MatterDetail>>
    archive: (id: string) => Promise<IpcResult<MatterDetail>>
    restore: (id: string) => Promise<IpcResult<MatterDetail>>
    setTags: (id: string, tagNames: string[]) => Promise<IpcResult<MatterDetail>>
    linkContact: (input: LinkMatterContactInput) => Promise<IpcResult<MatterDetail>>
    unlinkContact: (matterId: string, contactId: string) => Promise<IpcResult<MatterDetail>>
  }
  organisations: {
    list: (search?: string) => Promise<IpcResult<OrganisationSummary[]>>
    get: (id: string) => Promise<IpcResult<OrganisationDetail>>
    create: (input: CreateOrganisationInput) => Promise<IpcResult<Organisation>>
    update: (id: string, input: UpdateOrganisationInput) => Promise<IpcResult<Organisation>>
    remove: (id: string) => Promise<IpcResult<{ id: string }>>
    addAlias: (organisationId: string, alias: string) => Promise<IpcResult<OrganisationAlias>>
    removeAlias: (aliasId: string) => Promise<IpcResult<{ id: string }>>
    search: (query: string) => Promise<IpcResult<OrganisationSummary[]>>
  }
  contacts: {
    list: (search?: string) => Promise<IpcResult<ContactSummary[]>>
    get: (id: string) => Promise<IpcResult<ContactDetail>>
    create: (input: CreateContactInput) => Promise<IpcResult<Contact>>
    update: (id: string, input: UpdateContactInput) => Promise<IpcResult<Contact>>
    remove: (id: string) => Promise<IpcResult<{ id: string }>>
    search: (query: string) => Promise<IpcResult<ContactSummary[]>>
  }
  tags: {
    list: () => Promise<IpcResult<Tag[]>>
  }
  events: {
    list: (matterId: string) => Promise<IpcResult<TimelineEvent[]>>
    get: (id: string) => Promise<IpcResult<TimelineEvent>>
    create: (input: CreateEventInput) => Promise<IpcResult<TimelineEvent>>
    update: (id: string, input: UpdateEventInput) => Promise<IpcResult<TimelineEvent>>
    remove: (id: string) => Promise<IpcResult<{ id: string }>>
  }
  tasks: {
    listForMatter: (matterId: string) => Promise<IpcResult<WorkItem[]>>
    get: (id: string) => Promise<IpcResult<WorkItem>>
    next: (matterId: string) => Promise<IpcResult<WorkItem | null>>
    createAction: (input: CreateActionInput) => Promise<IpcResult<WorkItem>>
    createWaiting: (input: CreateWaitingInput) => Promise<IpcResult<WorkItem>>
    update: (id: string, input: UpdateWorkItemInput) => Promise<IpcResult<WorkItem>>
    complete: (id: string) => Promise<IpcResult<WorkItem>>
    resolve: (id: string) => Promise<IpcResult<WorkItem>>
    cancel: (id: string) => Promise<IpcResult<WorkItem>>
    reopen: (id: string) => Promise<IpcResult<WorkItem>>
    setNext: (id: string) => Promise<IpcResult<WorkItem>>
    clearNext: (matterId: string) => Promise<IpcResult<{ matterId: string }>>
    listWaiting: () => Promise<IpcResult<WaitingBoard>>
    today: () => Promise<IpcResult<TodayDashboard>>
  }
  documents: {
    listForMatter: (matterId: string) => Promise<IpcResult<MatterDocument[]>>
    pick: () => Promise<IpcResult<PickedFile | null>>
    addReference: (input: AttachDocumentInput) => Promise<IpcResult<MatterDocument>>
    addCopy: (input: AttachDocumentInput) => Promise<IpcResult<MatterDocument>>
    open: (id: string) => Promise<IpcResult<{ id: string }>>
    reveal: (id: string) => Promise<IpcResult<{ id: string }>>
    relink: (id: string, input: RelinkDocumentInput) => Promise<IpcResult<MatterDocument>>
    update: (id: string, input: UpdateDocumentInput) => Promise<IpcResult<MatterDocument>>
    remove: (id: string) => Promise<IpcResult<{ id: string }>>
  }
  search: {
    global: (query: string) => Promise<IpcResult<SearchResponse>>
  }
  context: {
    build: (matterId: string, options: ContextOptions) => Promise<IpcResult<ContextExport>>
    copy: (text: string) => Promise<IpcResult<{ copied: true }>>
    save: (input: ContextSaveInput) => Promise<IpcResult<{ saved: boolean }>>
  }
}

export const IPC_CHANNELS = {
  mattersList: 'matters:list',
  mattersGet: 'matters:get',
  mattersCreate: 'matters:create',
  mattersUpdate: 'matters:update',
  mattersArchive: 'matters:archive',
  mattersRestore: 'matters:restore',
  mattersSetTags: 'matters:setTags',
  mattersLinkContact: 'matters:linkContact',
  mattersUnlinkContact: 'matters:unlinkContact',
  organisationsList: 'organisations:list',
  organisationsGet: 'organisations:get',
  organisationsCreate: 'organisations:create',
  organisationsUpdate: 'organisations:update',
  organisationsRemove: 'organisations:remove',
  organisationsAddAlias: 'organisations:addAlias',
  organisationsRemoveAlias: 'organisations:removeAlias',
  organisationsSearch: 'organisations:search',
  contactsList: 'contacts:list',
  contactsGet: 'contacts:get',
  contactsCreate: 'contacts:create',
  contactsUpdate: 'contacts:update',
  contactsRemove: 'contacts:remove',
  contactsSearch: 'contacts:search',
  tagsList: 'tags:list',
  eventsList: 'events:list',
  eventsGet: 'events:get',
  eventsCreate: 'events:create',
  eventsUpdate: 'events:update',
  eventsRemove: 'events:remove',
  tasksListForMatter: 'tasks:listForMatter',
  tasksGet: 'tasks:get',
  tasksNext: 'tasks:next',
  tasksCreateAction: 'tasks:createAction',
  tasksCreateWaiting: 'tasks:createWaiting',
  tasksUpdate: 'tasks:update',
  tasksComplete: 'tasks:complete',
  tasksResolve: 'tasks:resolve',
  tasksCancel: 'tasks:cancel',
  tasksReopen: 'tasks:reopen',
  tasksSetNext: 'tasks:setNext',
  tasksClearNext: 'tasks:clearNext',
  tasksListWaiting: 'tasks:listWaiting',
  tasksToday: 'tasks:today',
  documentsListForMatter: 'documents:listForMatter',
  documentsPick: 'documents:pick',
  documentsAddReference: 'documents:addReference',
  documentsAddCopy: 'documents:addCopy',
  documentsOpen: 'documents:open',
  documentsReveal: 'documents:reveal',
  documentsRelink: 'documents:relink',
  documentsUpdate: 'documents:update',
  documentsRemove: 'documents:remove',
  searchGlobal: 'search:global',
  contextBuild: 'context:build',
  contextCopy: 'context:copy',
  contextSave: 'context:save'
} as const
