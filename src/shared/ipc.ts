import type {
  Contact,
  ContactDetail,
  ContactSummary,
  CreateContactInput,
  CreateMatterInput,
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
  UpdateContactInput,
  UpdateMatterInput,
  UpdateOrganisationInput
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
  tagsList: 'tags:list'
} as const
