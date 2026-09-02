import { AppError, USER_ERRORS } from '@shared/errors'
import * as documents from '../db/documents'
import * as matters from '../db/matters'
import type { DatabaseStore } from '../db/store'
import {
  absoluteManagedPath,
  isStrictlyInsideRoot,
  managedDirectoryPath,
  quarantineManagedDirectory,
  removeQuarantineDirectory,
  restoreQuarantine
} from '../documents/files'

export type MatterDeletionServiceHooks = {
  quarantineManagedDirectory?: typeof quarantineManagedDirectory
  restoreQuarantine?: typeof restoreQuarantine
  removeQuarantineDirectory?: typeof removeQuarantineDirectory
}

export type MatterDeletionResult = { id: string }

type QuarantinedCopy = {
  id: string
  quarantinePath: string
}

/**
 * Coordinates the reversible filesystem phase with the durable Matter
 * deletion. The database repository deliberately knows nothing about files.
 */
export function createMatterDeletionService(
  store: DatabaseStore,
  documentsRoot: string,
  hooks: MatterDeletionServiceHooks = {}
) {
  const quarantine = hooks.quarantineManagedDirectory ?? quarantineManagedDirectory
  const restore = hooks.restoreQuarantine ?? restoreQuarantine
  const cleanup = hooks.removeQuarantineDirectory ?? removeQuarantineDirectory

  function restoreCopies(copies: QuarantinedCopy[]): void {
    let firstError: unknown
    for (const copy of [...copies].reverse()) {
      try {
        restore(documentsRoot, copy.quarantinePath, managedDirectoryPath(documentsRoot, copy.id))
      } catch (error) {
        firstError ??= error
        console.error(`[matterdock] managed copy restore failed during Matter deletion: ${copy.id}`, error)
      }
    }
    if (firstError) {
      throw new AppError(USER_ERRORS.matterDeleteRecoveryFailed, 'MATTER_DELETE_RECOVERY_FAILED', {
        cause: firstError
      })
    }
  }

  function safeDeleteError(error: unknown): AppError {
    if (error instanceof AppError) return error
    return new AppError(USER_ERRORS.matterDeleteFailed, 'MATTER_DELETE_FAILED', { cause: error })
  }

  return {
    deletePermanently(id: string): MatterDeletionResult {
      store.assertWritable()

      const matterDocuments = store.query((db) => {
        // This deliberately raises MATTER_NOT_FOUND rather than treating a
        // repeated delete as an idempotent success.
        const matter = matters.getMatter(db, id)
        if (matter.trashedAt == null) {
          throw new AppError(USER_ERRORS.matterDeleteRequiresTrash, 'MATTER_DELETE_REQUIRES_TRASH')
        }
        return documents.listDocumentsForMatter(db, id)
      })
      const managedDocuments = matterDocuments.filter((document) => document.storageMode === 'copy')

      // Validate every managed metadata path before moving any directory. The
      // actual destructive target remains the UUID-derived directory used by
      // the existing file safety helpers, never a database-controlled path.
      for (const document of managedDocuments) {
        if (!document.managedPath) {
          throw new AppError(USER_ERRORS.unsafeDocumentPath, 'UNSAFE_PATH')
        }
        const managedDirectory = managedDirectoryPath(documentsRoot, document.id)
        const managedFile = absoluteManagedPath(documentsRoot, document.managedPath)
        if (!managedFile || !isStrictlyInsideRoot(managedDirectory, managedFile)) {
          throw new AppError(USER_ERRORS.unsafeDocumentPath, 'UNSAFE_PATH')
        }
      }

      const quarantined: QuarantinedCopy[] = []
      try {
        for (const document of managedDocuments) {
          const quarantinePath = quarantine(documentsRoot, document.id)
          if (quarantinePath) quarantined.push({ id: document.id, quarantinePath })
        }
      } catch (error) {
        restoreCopies(quarantined)
        throw safeDeleteError(error)
      }

      try {
        store.mutate((db) => {
          matters.deleteMatterRecord(db, id)
        })
      } catch (error) {
        restoreCopies(quarantined)
        throw safeDeleteError(error)
      }

      for (const copy of quarantined) {
        try {
          cleanup(documentsRoot, copy.id)
        } catch (error) {
          // The database deletion is already durable. Keep the quarantine for
          // the existing startup reconciliation path; never resurrect an
          // active orphan copy here.
          console.error(`[matterdock] stale managed-copy quarantine retained: ${copy.id}`, error)
        }
      }

      return { id }
    }
  }
}

export type MatterDeletionService = ReturnType<typeof createMatterDeletionService>
