export class AppError extends Error {
  readonly code: string

  constructor(message: string, code = 'APP_ERROR', options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
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
  unexpected: 'Something went wrong. Please try again.'
} as const
