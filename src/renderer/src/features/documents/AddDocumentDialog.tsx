import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { DocumentStorageMode, PickedFile } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Field'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { formatBytes } from './format'

export function AddDocumentDialog({
  open,
  matterId,
  picked,
  onClose
}: {
  open: boolean
  matterId: string
  picked: PickedFile | null
  onClose: () => void
}) {
  if (!open || !picked) return null
  return <AddDocumentForm matterId={matterId} picked={picked} onClose={onClose} />
}

function AddDocumentForm({
  matterId,
  picked,
  onClose
}: {
  matterId: string
  picked: PickedFile
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<DocumentStorageMode>('reference')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const input = { matterId, path: picked.path, notes }
      return mode === 'copy' ? api.documents.addCopy(input) : api.documents.addReference(input)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(mode === 'copy' ? 'Document copied into MatterDock.' : 'Document reference added.')
      onClose()
    },
    onError: (cause) => {
      const message =
        cause instanceof UserFacingError ? cause.message : 'The document could not be saved. The original file was not changed.'
      setError(message)
      toast.push(message, 'error')
    }
  })

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Add document"
      actions={
        <>
          <DialogCloseButton />
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            Add document
          </Button>
        </>
      }
    >
      {error ? <p className="field-error">{error}</p> : null}
      <p className="entity-title">{picked.name}</p>
      <p className="quiet">{formatBytes(picked.size)}</p>
      <p className="muted" style={{ marginTop: 8, wordBreak: 'break-all' }}>
        {picked.path}
      </p>
      <fieldset className="direction-fieldset">
        <legend className="field-label">How should MatterDock keep this file?</legend>
        <label className="radio-row">
          <input type="radio" name="storage-mode" checked={mode === 'reference'} onChange={() => setMode('reference')} />
          <span>
            <strong>Reference original</strong>
            <span className="muted"> — Keep the file where it is.</span>
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name="storage-mode" checked={mode === 'copy'} onChange={() => setMode('copy')} />
          <span>
            <strong>Copy into MatterDock</strong>
            <span className="muted"> — Keep a managed copy inside this workspace.</span>
          </span>
        </label>
      </fieldset>
      <Field label="Notes" htmlFor="document-notes">
        <Textarea id="document-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
    </Dialog>
  )
}
