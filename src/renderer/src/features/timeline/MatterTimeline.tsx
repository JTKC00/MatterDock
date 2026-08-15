import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EVENT_TYPE_LABELS, EVENT_TYPES, type EventType, type MatterContact, type TimelineEvent } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { api, UserFacingError } from '@/lib/api'
import { formatDayHeading } from '@/lib/dates'
import { useToast } from '@/lib/toast'
import { EventDialog } from './EventDialog'
import { TimelineEventCard } from './TimelineEventCard'

export function MatterTimeline({
  matterId,
  matterContacts
}: {
  matterId: string
  matterContacts: MatterContact[]
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [draftType, setDraftType] = useState<EventType | null>(null)
  const [editing, setEditing] = useState<TimelineEvent | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TimelineEvent | null>(null)

  const events = useQuery({
    queryKey: ['events', matterId],
    queryFn: () => api.events.list(matterId)
  })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setMenuOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const groups = useMemo(() => groupByDay(events.data ?? []), [events.data])

  const remove = useMutation({
    mutationFn: (id: string) => api.events.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push('Activity deleted.')
      setPendingDelete(null)
    },
    onError: (error) =>
      toast.push(error instanceof UserFacingError ? error.message : 'This activity could not be deleted.', 'error')
  })

  function startCreate(type: EventType) {
    setMenuOpen(false)
    setDraftType(type)
  }

  return (
    <section className="timeline-panel">
      <div className="timeline-heading">
        <h2 className="section-label">Timeline</h2>
        <div className="add-activity">
          <Button variant="secondary" onClick={() => setMenuOpen((value) => !value)}>
            <Plus />
            Add Activity
          </Button>
          {menuOpen ? (
            <div className="combobox-menu add-activity-menu" role="menu">
              {EVENT_TYPES.map((type) => (
                <button key={type} type="button" className="combobox-item" role="menuitem" onClick={() => startCreate(type)}>
                  {EVENT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {(events.data?.length ?? 0) === 0 && !events.isLoading ? (
        <div className="timeline-empty">
          <p className="quiet">No activity yet.</p>
          <p className="muted">Add a note, call, email or other activity to start building this matter’s history.</p>
          <Button onClick={() => setMenuOpen(true)}>+ Add Activity</Button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="timeline-day">
            <h3 className="timeline-day-label">{group.label}</h3>
            {group.events.map((item) => (
              <TimelineEventCard
                key={item.id}
                event={item}
                onEdit={() => setEditing(item)}
                onDelete={() => setPendingDelete(item)}
              />
            ))}
          </section>
        ))
      )}

      <EventDialog
        open={Boolean(draftType)}
        matterId={matterId}
        matterContacts={matterContacts}
        type={draftType ?? 'note'}
        onClose={() => setDraftType(null)}
      />
      <EventDialog
        open={Boolean(editing)}
        matterId={matterId}
        matterContacts={matterContacts}
        type={editing?.type ?? 'note'}
        event={editing}
        onClose={() => setEditing(null)}
      />
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete this activity?"
        description="This removes the activity from the matter timeline. This action cannot currently be undone."
        actions={
          <>
            <DialogCloseButton />
            <Button variant="danger" onClick={() => pendingDelete && remove.mutate(pendingDelete.id)} disabled={remove.isPending}>
              Delete
            </Button>
          </>
        }
      >
        <p className="quiet">The contact itself will not be deleted.</p>
      </Dialog>
    </section>
  )
}

function groupByDay(events: TimelineEvent[]): Array<{ label: string; events: TimelineEvent[] }> {
  const groups: Array<{ label: string; events: TimelineEvent[] }> = []
  for (const event of events) {
    const label = formatDayHeading(event.occurredAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.events.push(event)
    else groups.push({ label, events: [event] })
  }
  return groups
}
