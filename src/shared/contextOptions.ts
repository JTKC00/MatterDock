import type { ContextOptions, ContextPreset } from './types'

export const defaultContextOptions: ContextOptions = {
  includeOverview: true,
  includeOrganisation: true,
  includeContacts: true,
  contactsMinimal: false,
  includeNextAction: true,
  includeOpenActions: true,
  includeWaiting: true,
  includeClosedWork: false,
  includeTimeline: true,
  timelineRange: 'all',
  includeDocuments: true,
  includeFilePaths: false,
  redactContactNames: false,
  redactOrganisationNames: false,
  redactEmails: false,
  redactPhones: false,
  redactReference: false,
  hideFilePaths: true,
  customRedactions: [],
  format: 'markdown'
}

export const CONTEXT_PRESET_LABELS: Record<ContextPreset, string> = {
  full: 'Full Matter Context',
  current_work: 'Current Work Only',
  timeline: 'Timeline Context',
  privacy_safe: 'Privacy-Safe Context'
}

export function optionsForPreset(preset: ContextPreset): ContextOptions {
  if (preset === 'current_work') {
    return {
      ...defaultContextOptions,
      contactsMinimal: true,
      includeTimeline: false
    }
  }
  if (preset === 'timeline') {
    return {
      ...defaultContextOptions,
      includeOpenActions: false,
      includeWaiting: false
    }
  }
  if (preset === 'privacy_safe') {
    return {
      ...defaultContextOptions,
      redactContactNames: true,
      redactOrganisationNames: true,
      redactEmails: true,
      redactPhones: true,
      redactReference: true,
      hideFilePaths: true,
      includeFilePaths: false
    }
  }
  return { ...defaultContextOptions }
}
