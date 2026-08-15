import type { MatterDockApi } from '../shared/ipc'

declare global {
  interface Window {
    matterdock: MatterDockApi
  }
}

export {}
