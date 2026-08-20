import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { MATTER_PRIORITIES, type MatterPriority, type WorkItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useT } from '@/i18n/LocaleProvider'
import { api, UserFacingError } from '@/lib/api'
import { fromOptionalDatetimeLocal, InvalidDatetimeError, toDatetimeLocal } from '@/lib/dates'
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
  const t = useT()
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
          dueAt: fromOptionalDatetimeLocal(dueAt),
          priority
        })
      }
      return api.tasks.createAction({
        matterId,
        title,
        notes,
        dueAt: fromOptionalDatetimeLocal(dueAt),
        priority,
        setAsNextAction: showNextCheckbox && setAsNext
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(item ? t('work.actionUpdated') : t('work.actionAdded'))
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
      title={item ? t('work.editAction') : t('work.newAction')}
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
      <Field label={t('common.title')} htmlFor="action-title">
        <Input id="action-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label={t('work.due')} htmlFor="action-due">
        <Input id="action-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </Field>
      <Field label={t('common.priority')} htmlFor="action-priority">
        <Select id="action-priority" value={priority} onChange={(event) => setPriority(event.target.value as MatterPriority)}>
          {MATTER_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {t(`priority.${value}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('work.notes')} htmlFor="action-notes">
        <Textarea id="action-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
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
