import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { MATTER_PRIORITIES, PRIORITY_LABELS, type MatterPriority, type WorkItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { api, UserFacingError } from '@/lib/api'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/dates'
import { useToast } from '@/lib/toast'

export function ActionDialog({
  open,
  matterId,
  item,
  defaultNext,
  onClose
}: {
  open: boolean
  matterId: string
  item?: WorkItem | null
  defaultNext: boolean
  onClose: () => void
}) {
  if (!open) return null
  return (
    <ActionForm matterId={matterId} item={item} defaultNext={defaultNext} onClose={onClose} />
  )
}

function ActionForm({
  matterId,
  item,
  defaultNext,
  onClose
}: {
  matterId: string
  item?: WorkItem | null
  defaultNext: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(item?.title ?? '')
  const [dueAt, setDueAt] = useState(item?.dueAt ? toDatetimeLocal(item.dueAt) : '')
  const [priority, setPriority] = useState<MatterPriority>(item?.priority ?? 'normal')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [setAsNext, setSetAsNext] = useState(defaultNext)
  const [error, setError] = useState<string | null>(null)
  const showNextCheckbox = !item && defaultNext

  const save = useMutation({
    mutationFn: async () => {
      if (item) {
        return api.tasks.update(item.id, {
          title,
          notes,
          dueAt: dueAt ? fromDatetimeLocal(dueAt) : null,
          priority
        })
      }
      return api.tasks.createAction({
        matterId,
        title,
        notes,
        dueAt: dueAt ? fromDatetimeLocal(dueAt) : null,
        priority,
        setAsNextAction: showNextCheckbox && setAsNext
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(item ? 'Action updated.' : 'Action added.')
      onClose()
    },
    onError: (cause) => {
      const message = cause instanceof UserFacingError ? cause.message : 'That item could not be saved. Your changes have not been lost. Please try again.'
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
      title={item ? 'Edit action' : 'New action'}
      actions={
        <>
          <DialogCloseButton />
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || title.trim().length === 0}>
            Save
          </Button>
        </>
      }
    >
      {error ? <p className="field-error">{error}</p> : null}
      <Field label="Title" htmlFor="action-title">
        <Input id="action-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Due" htmlFor="action-due">
        <Input id="action-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </Field>
      <Field label="Priority" htmlFor="action-priority">
        <Select id="action-priority" value={priority} onChange={(event) => setPriority(event.target.value as MatterPriority)}>
          {MATTER_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" htmlFor="action-notes">
        <Textarea id="action-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      {showNextCheckbox ? (
        <label className="radio-row">
          <input type="checkbox" checked={setAsNext} onChange={(event) => setSetAsNext(event.target.checked)} />
          Set as Next Action
        </label>
      ) : !item ? (
        <p className="muted">This matter already has a Next Action. You can change it after creating this item.</p>
      ) : null}
    </Dialog>
  )
}
