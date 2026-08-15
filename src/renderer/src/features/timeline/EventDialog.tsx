import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { EVENT_TYPE_LABELS, type EventDirection, type EventType, type MatterContact, type TimelineEvent } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { api, UserFacingError } from '@/lib/api'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/dates'
import { useToast } from '@/lib/toast'
import { EventContactField } from './EventContactField'
import { defaultDirection, directionFieldLabel, usesDirection } from './labels'

export function EventDialog({
  open,
  matterId,
  matterContacts,
  type,
  event,
  onClose
}: {
  open: boolean
  matterId: string
  matterContacts: MatterContact[]
  type: EventType
  event?: TimelineEvent | null
  onClose: () => void
}) {
  if (!open) return null
  return (
    <EventForm
      matterId={matterId}
      matterContacts={matterContacts}
      type={event?.type ?? type}
      event={event}
      onClose={onClose}
    />
  )
}

function EventForm({
  matterId,
  matterContacts,
  type,
  event,
  onClose
}: {
  matterId: string
  matterContacts: MatterContact[]
  type: EventType
  event?: TimelineEvent | null
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const labels = directionFieldLabel(type)
  const [title, setTitle] = useState(event?.title ?? '')
  const [body, setBody] = useState(event?.body ?? '')
  const [direction, setDirection] = useState<EventDirection>(event?.direction ?? defaultDirection(type))
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocal(event?.occurredAt ?? new Date().toISOString()))
  const [contactId, setContactId] = useState<string | null>(event?.contactId ?? null)
  const [contactQuery, setContactQuery] = useState(event?.contactName ?? '')
  const [selectedContactName, setSelectedContactName] = useState(event?.contactName ?? '')
  const [fromAddress, setFromAddress] = useState(event?.email?.fromAddress ?? '')
  const [toAddresses, setToAddresses] = useState(event?.email?.toAddresses ?? '')
  const [ccAddresses, setCcAddresses] = useState(event?.email?.ccAddresses ?? '')
  const [subject, setSubject] = useState(event?.email?.subject ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        body,
        contactId,
        direction: usesDirection(type) ? direction : defaultDirection(type),
        occurredAt: fromDatetimeLocal(occurredAt),
        email:
          type === 'email'
            ? { fromAddress, toAddresses, ccAddresses, subject }
            : null
      }
      return event
        ? api.events.update(event.id, payload)
        : api.events.create({ matterId, type, ...payload })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(event ? 'Activity updated.' : 'Activity added.')
      onClose()
    },
    onError: (cause) => {
      const message =
        cause instanceof UserFacingError ? cause.message : 'Activity could not be saved. Your changes have not been lost. Please try again.'
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
      title={event ? `Edit ${EVENT_TYPE_LABELS[type].toLowerCase()}` : `Add ${EVENT_TYPE_LABELS[type].toLowerCase()}`}
      actions={
        <>
          <DialogCloseButton />
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      {error ? <p className="field-error">{error}</p> : null}
      {usesDirection(type) ? (
        <fieldset className="direction-fieldset">
          <legend className="field-label">Direction</legend>
          <label className="radio-row">
            <input
              type="radio"
              name="direction"
              checked={direction === 'incoming'}
              onChange={() => setDirection('incoming')}
            />
            {labels.incoming}
          </label>
          <label className="radio-row">
            <input
              type="radio"
              name="direction"
              checked={direction === 'outgoing'}
              onChange={() => setDirection('outgoing')}
            />
            {labels.outgoing}
          </label>
        </fieldset>
      ) : null}
      {type === 'meeting' || type === 'letter' ? (
        <Field label={type === 'meeting' ? 'Title' : 'Subject / title'} htmlFor="event-title">
          <Input id="event-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
      ) : null}
      <Field label="Date & time" htmlFor="event-when">
        <Input
          id="event-when"
          type="datetime-local"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </Field>
      <EventContactField
        matterContacts={matterContacts}
        query={contactQuery}
        selectedId={contactId}
        selectedName={selectedContactName}
        onQueryChange={setContactQuery}
        onSelect={(id, name) => {
          setContactId(id)
          setContactQuery(name)
          setSelectedContactName(id ? name : '')
        }}
      />
      {type === 'email' ? (
        <>
          <Field label="From" htmlFor="email-from">
            <Input id="email-from" value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} />
          </Field>
          <Field label="To" htmlFor="email-to">
            <Input id="email-to" value={toAddresses} onChange={(event) => setToAddresses(event.target.value)} />
          </Field>
          <Field label="CC" htmlFor="email-cc">
            <Input id="email-cc" value={ccAddresses} onChange={(event) => setCcAddresses(event.target.value)} />
          </Field>
          <Field label="Subject" htmlFor="email-subject">
            <Input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
        </>
      ) : null}
      <Field
        label={type === 'email' ? 'Body' : type === 'note' ? 'Note' : 'Notes'}
        htmlFor="event-body"
      >
        <Textarea
          id="event-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={type === 'email' ? 'Paste email here…' : undefined}
        />
      </Field>
    </Dialog>
  )
}
