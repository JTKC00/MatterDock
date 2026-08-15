import type { IpcResult } from '@shared/types'

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  if (!window.matterdock) {
    throw new UserFacingError('MatterDock could not connect to local data. Please restart the app.')
  }
  const result = await promise
  if (!result.ok) throw new UserFacingError(result.error)
  return result.data
}

export const api = {
  matters: {
    list: (query?: Parameters<Window['matterdock']['matters']['list']>[0]) =>
      unwrap(window.matterdock.matters.list(query)),
    get: (id: string) => unwrap(window.matterdock.matters.get(id)),
    create: (input: Parameters<Window['matterdock']['matters']['create']>[0]) =>
      unwrap(window.matterdock.matters.create(input)),
    update: (...args: Parameters<Window['matterdock']['matters']['update']>) =>
      unwrap(window.matterdock.matters.update(...args)),
    archive: (id: string) => unwrap(window.matterdock.matters.archive(id)),
    restore: (id: string) => unwrap(window.matterdock.matters.restore(id)),
    setTags: (...args: Parameters<Window['matterdock']['matters']['setTags']>) =>
      unwrap(window.matterdock.matters.setTags(...args)),
    linkContact: (input: Parameters<Window['matterdock']['matters']['linkContact']>[0]) =>
      unwrap(window.matterdock.matters.linkContact(input)),
    unlinkContact: (...args: Parameters<Window['matterdock']['matters']['unlinkContact']>) =>
      unwrap(window.matterdock.matters.unlinkContact(...args))
  },
  organisations: {
    list: (search?: string) => unwrap(window.matterdock.organisations.list(search)),
    get: (id: string) => unwrap(window.matterdock.organisations.get(id)),
    create: (input: Parameters<Window['matterdock']['organisations']['create']>[0]) =>
      unwrap(window.matterdock.organisations.create(input)),
    update: (...args: Parameters<Window['matterdock']['organisations']['update']>) =>
      unwrap(window.matterdock.organisations.update(...args)),
    remove: (id: string) => unwrap(window.matterdock.organisations.remove(id)),
    addAlias: (...args: Parameters<Window['matterdock']['organisations']['addAlias']>) =>
      unwrap(window.matterdock.organisations.addAlias(...args)),
    removeAlias: (id: string) => unwrap(window.matterdock.organisations.removeAlias(id)),
    search: (query: string) => unwrap(window.matterdock.organisations.search(query))
  },
  contacts: {
    list: (search?: string) => unwrap(window.matterdock.contacts.list(search)),
    get: (id: string) => unwrap(window.matterdock.contacts.get(id)),
    create: (input: Parameters<Window['matterdock']['contacts']['create']>[0]) =>
      unwrap(window.matterdock.contacts.create(input)),
    update: (...args: Parameters<Window['matterdock']['contacts']['update']>) =>
      unwrap(window.matterdock.contacts.update(...args)),
    remove: (id: string) => unwrap(window.matterdock.contacts.remove(id)),
    search: (query: string) => unwrap(window.matterdock.contacts.search(query))
  },
  tags: {
    list: () => unwrap(window.matterdock.tags.list())
  }
}
