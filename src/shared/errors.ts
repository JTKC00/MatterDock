export class AppError extends Error {
  readonly code: string
  readonly recoveryPath?: string

  constructor(
    message: string,
    code = 'APP_ERROR',
    options?: { cause?: unknown; recoveryPath?: string }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'AppError'
    this.code = code
    this.recoveryPath = options?.recoveryPath
  }
}

export function toUserError(error: unknown, fallback: string): string {
  if (error instanceof AppError) return error.message
  if (error instanceof Error && error.name === 'ZodError') return fallback
  return fallback
}

export const USER_ERRORS = {
  matterNotSaved: 'Matter could not be saved. Your changes have not been lost. Please try again.',
  matterNotFound: 'This matter could not be found.',
  organisationNotSaved: 'Organisation could not be saved. Your changes have not been lost. Please try again.',
  organisationNotFound: 'This organisation could not be found.',
  organisationInUse:
    'This organisation is linked to existing matters, so it cannot be deleted. Archive or reassign those matters first.',
  aliasNotSaved: 'That alias could not be added.',
  aliasDuplicate: 'This organisation already has that alias.',
  contactNotSaved: 'Contact could not be saved. Your changes have not been lost. Please try again.',
  contactNotFound: 'This contact could not be found.',
  contactInUse:
    'This contact is linked to existing matters. Unlink those matters before deleting the contact.',
  linkNotSaved: 'The contact could not be linked to this matter.',
  linkExists: 'This contact is already linked to the matter.',
  database: 'MatterDock could not read or write local data. Please try again.',
  persistFailed: 'Changes could not be saved to disk. Please try again.',
  eventNotFound: 'This activity could not be found.',
  eventNotSaved: 'Activity could not be saved. Your changes have not been lost. Please try again.',
  taskNotFound: 'This item could not be found.',
  taskNotSaved: 'That item could not be saved. Your changes have not been lost. Please try again.',
  nextActionClosed: 'Only an open item can be the next action.',
  notAnAction: 'Only an action can be completed.',
  notWaiting: 'Only a waiting item can be resolved.',
  alreadyClosed: 'This item is already closed.',
  alreadyOpen: 'This item is already open.',
  unexpected: 'Something went wrong. Please try again.',
  documentNotFound: 'This document could not be found.',
  documentNotSaved: 'The document could not be saved. Your changes have not been lost. Please try again.',
  documentDuplicate: 'This file is already attached to the matter.',
  fileUnavailable: 'The original file could not be found at its saved location.',
  managedCopyMissing: 'The MatterDock workspace copy is missing.',
  fileCopyFailed: 'The file could not be copied into MatterDock. The original file was not changed.',
  fileOpenFailed: 'The file could not be opened.',
  fileRevealFailed: 'The file location could not be shown.',
  documentRemoveFailed: 'The document could not be removed.',
  unsafeDocumentPath: 'That file is outside the MatterDock workspace and cannot be changed.',
  cannotRelinkCopy: 'MatterDock copies cannot be relinked to another source file.',
  contextNotBuilt: 'This matter context could not be prepared.',
  contextSaveFailed: 'The context file could not be saved. No MatterDock data was changed.',
  workspaceBusy: 'MatterDock is busy with a backup or restore. Please try again in a moment.',
  backupFailed: 'The backup could not be created. Your MatterDock data was not changed.',
  backupManagedMissing:
    'The backup could not be created because a MatterDock-owned file is missing. Your MatterDock data was not changed.',
  backupInvalid: 'This file is not a valid MatterDock backup.',
  backupDamaged: 'This backup is damaged and cannot be restored.',
  backupNewerVersion:
    'This backup was created by a newer MatterDock version and cannot be restored safely.',
  restoreFailedRecovered:
    'The backup could not be restored. Your previous MatterDock data has been recovered.',
  restoreFailedUnrecovered:
    'Restore failed and MatterDock could not automatically recover the previous workspace. A recovery copy remains available.',
  restoreInterruptedFatal:
    'MatterDock could not safely recover an interrupted restore. Your workspace has not been opened for editing.',
  exportFailed: 'The data export could not be created. Your MatterDock data was not changed.',
  backupPreviousPreserved:
    'The new backup could not be created. Your previous backup was preserved in a recovery location.',
  waitingForRequired: 'Say who or what you are waiting for.'
} as const
