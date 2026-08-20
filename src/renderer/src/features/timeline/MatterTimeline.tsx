import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EVENT_TYPES, type EventType, type MatterContact, type TimelineEvent } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { useT } from '@/i18n/LocaleProvider'
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
  const t = useT()
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
      toast.push(t('timeline.deleted'))
      setPendingDelete(null)
    },
    onError: (error) =>
      toast.push(error instanceof UserFacingError ? error.message : t('timeline.deleteFailed'), 'error')
  })

  function startCreate(type: EventType) {
    setMenuOpen(false)
    setDraftType(type)
  }

  return (
    <section className="timeline-panel">
      <div className="timeline-heading">
        <h2 className="section-label">{t('timeline.title')}</h2>
        <div className="add-activity">
          <Button variant="secondary" onClick={() => setMenuOpen((value) => !value)}>
            <Plus />
            {t('timeline.addActivity')}
          </Button>
          {menuOpen ? (
            <div className="combobox-menu add-activity-menu" role="menu">
              {EVENT_TYPES.map((type) => (
                <button key={type} type="button" className="combobox-item" role="menuitem" onClick={() => startCreate(type)}>
                  {type === 'phone' ? t('timeline.phoneCall') : t(`timeline.${type}`)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {(events.data?.length ?? 0) === 0 && !events.isLoading ? (
        <div className="timeline-empty">
          <p className="quiet">{t('timeline.empty')}</p>
          <p className="muted">{t('timeline.emptyHint')}</p>
          <Button onClick={() => setMenuOpen(true)}>+ {t('timeline.addActivity')}</Button>
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
        title={t('timeline.deleteTitle')}
        description={t('timeline.deleteBody')}
        actions={
          <>
            <DialogCloseButton />
            <Button variant="danger" onClick={() => pendingDelete && remove.mutate(pendingDelete.id)} disabled={remove.isPending}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="quiet">{t('timeline.deleteNote')}</p>
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
