import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { MatterContact, WorkItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { EventContactField } from '@/features/timeline/EventContactField'
import { api, UserFacingError } from '@/lib/api'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/dates'
import { useToast } from '@/lib/toast'

export function WaitingDialog({
  open,
  matterId,
  matterContacts,
  item,
  defaultNext,
  onClose
}: {
  open: boolean
  matterId: string
  matterContacts: MatterContact[]
  item?: WorkItem | null
  defaultNext: boolean
  onClose: () => void
}) {
  if (!open) return null
  return (
    <WaitingForm
      matterId={matterId}
      matterContacts={matterContacts}
      item={item}
      defaultNext={defaultNext}
      onClose={onClose}
    />
  )
}

function WaitingForm({
  matterId,
  matterContacts,
  item,
  defaultNext,
  onClose
}: {
  matterId: string
  matterContacts: MatterContact[]
  item?: WorkItem | null
  defaultNext: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(item?.title ?? '')
  const [contactId, setContactId] = useState<string | null>(item?.waitingForContactId ?? null)
  const [contactQuery, setContactQuery] = useState(item?.waitingForDisplay ?? item?.waitingForText ?? '')
  const [selectedName, setSelectedName] = useState(item?.waitingForDisplay ?? '')
  const [waitingSince, setWaitingSince] = useState(
    toDatetimeLocal(item?.waitingSince ?? new Date().toISOString())
  )
  const [dueAt, setDueAt] = useState(item?.dueAt ? toDatetimeLocal(item.dueAt) : '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [setAsNext, setSetAsNext] = useState(defaultNext)
  const [error, setError] = useState<string | null>(null)
  const showNextCheckbox = !item && defaultNext

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        notes,
        dueAt: dueAt ? fromDatetimeLocal(dueAt) : null,
        waitingForContactId: contactId,
        waitingForText: contactId ? selectedName || contactQuery : contactQuery,
        waitingSince: fromDatetimeLocal(waitingSince)
      }
      if (item) {
        return api.tasks.update(item.id, payload)
      }
      return api.tasks.createWaiting({
        matterId,
        ...payload,
        setAsNextAction: showNextCheckbox && setAsNext
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(item ? 'Waiting updated.' : 'Waiting added.')
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
      title={item ? 'Edit waiting item' : 'New waiting item'}
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
      <EventContactField
        matterContacts={matterContacts}
        query={contactQuery}
        selectedId={contactId}
        selectedName={selectedName}
        onQueryChange={setContactQuery}
        onSelect={(id, name) => {
          setContactId(id)
          setContactQuery(name)
          setSelectedName(id ? name : '')
        }}
      />
      <p className="muted">You can also type a name or organisation if there is no contact.</p>
      <Field label="What are you waiting for?" htmlFor="waiting-title">
        <Input id="waiting-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Waiting since" htmlFor="waiting-since">
        <Input
          id="waiting-since"
          type="datetime-local"
          value={waitingSince}
          onChange={(event) => setWaitingSince(event.target.value)}
        />
      </Field>
      <Field label="Follow up" htmlFor="waiting-follow">
        <Input id="waiting-follow" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="waiting-notes">
        <Textarea id="waiting-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
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
