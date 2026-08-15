import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PRIORITY_LABELS, type MatterContact, type WorkItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { ActionDialog } from './ActionDialog'
import { WaitingDialog } from './WaitingDialog'
import { WorkItemCard } from './WorkItemCard'
import { dueLabel } from './dueLabels'

export function MatterWork({
  matterId,
  matterContacts
}: {
  matterId: string
  matterContacts: MatterContact[]
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const items = useQuery({ queryKey: ['tasks', matterId], queryFn: () => api.tasks.listForMatter(matterId) })
  const [actionOpen, setActionOpen] = useState(false)
  const [waitingOpen, setWaitingOpen] = useState(false)
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [closedOpen, setClosedOpen] = useState(false)
  const [replaceTarget, setReplaceTarget] = useState<WorkItem | null>(null)

  const next = items.data?.find((item) => item.isNextAction && item.status === 'open') ?? null
  const openActions = items.data?.filter((item) => item.type === 'action' && item.status === 'open') ?? []
  const openWaiting = items.data?.filter((item) => item.type === 'waiting' && item.status === 'open') ?? []
  const closed = items.data?.filter((item) => item.status !== 'open') ?? []
  const defaultNext = !next

  const invalidate = async () => {
    await queryClient.invalidateQueries()
  }

  const complete = useMutation({
    mutationFn: (item: WorkItem) => (item.type === 'waiting' ? api.tasks.resolve(item.id) : api.tasks.complete(item.id)),
    onSuccess: async (_, item) => {
      await invalidate()
      toast.push(item.type === 'waiting' ? 'Waiting resolved.' : 'Action completed.')
    },
    onError: (error) => toast.push(message(error), 'error')
  })
  const cancel = useMutation({
    mutationFn: (id: string) => api.tasks.cancel(id),
    onSuccess: async () => {
      await invalidate()
      toast.push('Item cancelled.')
    },
    onError: (error) => toast.push(message(error), 'error')
  })
  const reopen = useMutation({
    mutationFn: (id: string) => api.tasks.reopen(id),
    onSuccess: async () => {
      await invalidate()
      toast.push('Item reopened.')
    },
    onError: (error) => toast.push(message(error), 'error')
  })
  const setNext = useMutation({
    mutationFn: (id: string) => api.tasks.setNext(id),
    onSuccess: async () => {
      await invalidate()
      toast.push('Next action updated.')
      setReplaceTarget(null)
    },
    onError: (error) => toast.push(message(error), 'error')
  })
  const clearNext = useMutation({
    mutationFn: () => api.tasks.clearNext(matterId),
    onSuccess: async () => {
      await invalidate()
      toast.push('Next action cleared.')
    },
    onError: (error) => toast.push(message(error), 'error')
  })

  function requestNext(item: WorkItem) {
    if (next && next.id !== item.id) setReplaceTarget(item)
    else setNext.mutate(item.id)
  }

  return (
    <>
      <section className="next-action">
        <h2 className="section-label">Next action</h2>
        {next ? (
          <div>
            {next.type === 'waiting' ? (
              <>
                <div className="entity-title">Waiting for {next.waitingForDisplay ?? 'someone'}</div>
                <p className="quiet">{next.title}</p>
                <p className={dueLabel(next.dueAt, new Date(), true)?.startsWith('Overdue') ? 'overdue' : 'quiet'}>
                  {dueLabel(next.dueAt, new Date(), true) ?? 'No follow-up date'}
                </p>
              </>
            ) : (
              <>
                <div className="entity-title">{next.title}</div>
                <p className="quiet">
                  {[dueLabel(next.dueAt), next.priority === 'high' || next.priority === 'urgent' ? PRIORITY_LABELS[next.priority] : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </>
            )}
            <div className="work-card-actions" style={{ marginTop: 10 }}>
              <Button variant="primary" onClick={() => complete.mutate(next)}>
                {next.type === 'waiting' ? 'Resolve' : 'Complete'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="quiet">No next action set</p>
            <Button variant="ghost" onClick={() => setPickOpen(true)}>
              Set next action
            </Button>
          </>
        )}
      </section>

      <section className="open-items">
        <div className="timeline-heading">
          <h2 className="section-label">Open items</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => setActionOpen(true)}>+ Action</Button>
            <Button onClick={() => setWaitingOpen(true)}>+ Waiting</Button>
          </div>
        </div>
        <h3 className="timeline-day-label">Actions</h3>
        {openActions.length === 0 ? <p className="muted">No open actions.</p> : null}
        {openActions.map((item) => (
          <WorkItemCard
            key={item.id}
            item={item}
            onPrimary={() => complete.mutate(item)}
            onSetNext={() => requestNext(item)}
            onClearNext={() => clearNext.mutate()}
            onEdit={() => setEditing(item)}
            onCancel={() => cancel.mutate(item.id)}
          />
        ))}
        <h3 className="timeline-day-label">Waiting</h3>
        {openWaiting.length === 0 ? <p className="muted">Not waiting on anyone.</p> : null}
        {openWaiting.map((item) => (
          <WorkItemCard
            key={item.id}
            item={item}
            onPrimary={() => complete.mutate(item)}
            onSetNext={() => requestNext(item)}
            onClearNext={() => clearNext.mutate()}
            onEdit={() => setEditing(item)}
            onCancel={() => cancel.mutate(item.id)}
          />
        ))}
        {closed.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <button type="button" className="back-link" onClick={() => setClosedOpen((value) => !value)}>
              Completed / closed ({closed.length})
            </button>
            {closedOpen
              ? closed.map((item) => (
                  <WorkItemCard
                    key={item.id}
                    item={item}
                    onPrimary={() => undefined}
                    onSetNext={() => undefined}
                    onClearNext={() => undefined}
                    onEdit={() => setEditing(item)}
                    onCancel={() => undefined}
                    onReopen={() => reopen.mutate(item.id)}
                  />
                ))
              : null}
          </div>
        ) : null}
      </section>

      <ActionDialog
        open={actionOpen || editing?.type === 'action'}
        matterId={matterId}
        item={editing?.type === 'action' ? editing : null}
        defaultNext={defaultNext}
        onClose={() => {
          setActionOpen(false)
          setEditing(null)
        }}
      />
      <WaitingDialog
        open={waitingOpen || editing?.type === 'waiting'}
        matterId={matterId}
        matterContacts={matterContacts}
        item={editing?.type === 'waiting' ? editing : null}
        defaultNext={defaultNext}
        onClose={() => {
          setWaitingOpen(false)
          setEditing(null)
        }}
      />
      <Dialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        title="Set next action"
        actions={<DialogCloseButton />}
      >
        <Button onClick={() => { setPickOpen(false); setActionOpen(true) }}>+ New Action</Button>
        <Button onClick={() => { setPickOpen(false); setWaitingOpen(true) }}>+ New Waiting</Button>
        {[...openActions, ...openWaiting].map((item) => (
          <button key={item.id} type="button" className="combobox-item" onClick={() => { setPickOpen(false); requestNext(item) }}>
            {item.type === 'waiting' ? `Waiting — ${item.title}` : item.title}
          </button>
        ))}
      </Dialog>
      <Dialog
        open={Boolean(replaceTarget)}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null)
        }}
        title="Replace current Next Action?"
        description={
          next && replaceTarget
            ? `“${next.title}” is currently the Next Action. Replace it with “${replaceTarget.type === 'waiting' ? `Waiting for ${replaceTarget.waitingForDisplay ?? 'someone'} — ${replaceTarget.title}` : replaceTarget.title}”?`
            : undefined
        }
        actions={
          <>
            <DialogCloseButton />
            <Button variant="primary" onClick={() => replaceTarget && setNext.mutate(replaceTarget.id)}>
              Replace
            </Button>
          </>
        }
      >
        <p className="quiet">{replaceTarget?.title}</p>
      </Dialog>
    </>
  )
}

function message(error: unknown): string {
  return error instanceof UserFacingError ? error.message : 'That change could not be saved.'
}
