import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { MatterContact, WorkItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { EventContactField } from '@/features/timeline/EventContactField'
import { useT } from '@/i18n/LocaleProvider'
import { api, UserFacingError } from '@/lib/api'
import {
  fromOptionalDatetimeLocal,
  fromRequiredDatetimeLocal,
  InvalidDatetimeError,
  toDatetimeLocal
} from '@/lib/dates'
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
  const t = useT()
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
        dueAt: fromOptionalDatetimeLocal(dueAt),
        waitingForContactId: contactId,
        waitingForText: contactId ? selectedName || contactQuery : contactQuery,
        waitingSince: fromRequiredDatetimeLocal(waitingSince)
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
      toast.push(item ? t('work.waitingUpdated') : t('work.waitingAdded'))
      onClose()
    },
    onError: (cause) => {
      const message =
        cause instanceof UserFacingError || cause instanceof InvalidDatetimeError
          ? cause.message
          : t('work.saveFailed')
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
      title={item ? t('work.editWaiting') : t('work.newWaiting')}
      actions={
        <>
          <DialogCloseButton />
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || title.trim().length === 0}>
            {t('common.save')}
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
      <p className="muted">{t('work.waitingHint')}</p>
      <Field label={t('work.waitingWhat')} htmlFor="waiting-title">
        <Input id="waiting-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label={t('work.waitingSince')} htmlFor="waiting-since">
        <Input
          id="waiting-since"
          type="datetime-local"
          value={waitingSince}
          onChange={(event) => setWaitingSince(event.target.value)}
        />
      </Field>
      <Field label={t('work.followUp')} htmlFor="waiting-follow">
        <Input id="waiting-follow" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </Field>
      <Field label={t('work.notes')} htmlFor="waiting-notes">
        <Textarea id="waiting-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      {showNextCheckbox ? (
        <label className="radio-row">
          <input type="checkbox" checked={setAsNext} onChange={(event) => setSetAsNext(event.target.checked)} />
          {t('work.setNext')}
        </label>
      ) : !item ? (
        <p className="muted">{t('work.alreadyHasNext')}</p>
      ) : null}
    </Dialog>
  )
}
