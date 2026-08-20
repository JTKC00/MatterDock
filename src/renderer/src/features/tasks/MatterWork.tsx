import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isOverdue } from '@shared/day'
import type { MatterContact, WorkItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { useT } from '@/i18n/LocaleProvider'
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
  const t = useT()
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
      toast.push(item.type === 'waiting' ? t('work.resolved') : t('work.completed'))
    },
    onError: (error) => toast.push(message(error, t('work.changeFailed')), 'error')
  })
  const cancel = useMutation({
    mutationFn: (id: string) => api.tasks.cancel(id),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('work.cancelled'))
    },
    onError: (error) => toast.push(message(error, t('work.changeFailed')), 'error')
  })
  const reopen = useMutation({
    mutationFn: (id: string) => api.tasks.reopen(id),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('work.reopened'))
    },
    onError: (error) => toast.push(message(error, t('work.changeFailed')), 'error')
  })
  const setNext = useMutation({
    mutationFn: (id: string) => api.tasks.setNext(id),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('work.nextSet'))
      setReplaceTarget(null)
    },
    onError: (error) => toast.push(message(error, t('work.changeFailed')), 'error')
  })
  const clearNext = useMutation({
    mutationFn: () => api.tasks.clearNext(matterId),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('work.nextCleared'))
    },
    onError: (error) => toast.push(message(error, t('work.changeFailed')), 'error')
  })

  function requestNext(item: WorkItem) {
    if (next && next.id !== item.id) setReplaceTarget(item)
    else setNext.mutate(item.id)
  }

  const replaceNextLabel =
    replaceTarget?.type === 'waiting'
      ? t('work.waitingTitlePrefix', {
          name: replaceTarget.waitingForDisplay ?? t('common.someone'),
          title: replaceTarget.title
        })
      : replaceTarget?.title

  return (
    <>
      <section className="next-action">
        <h2 className="section-label">{t('work.nextAction')}</h2>
        {next ? (
          <div>
            {next.type === 'waiting' ? (
              <>
                <div className="entity-title">
                  {t('work.waitingPrefix', { name: next.waitingForDisplay ?? t('common.someone') })}
                </div>
                <p className="quiet">{next.title}</p>
                <p className={isOverdue(next.dueAt) ? 'overdue' : 'quiet'}>
                  {dueLabel(next.dueAt, new Date(), true) ?? t('work.noFollowUp')}
                </p>
              </>
            ) : (
              <>
                <div className="entity-title">{next.title}</div>
                <p className="quiet">
                  {[dueLabel(next.dueAt), next.priority === 'high' || next.priority === 'urgent' ? t(`priority.${next.priority}`) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </>
            )}
            <div className="work-card-actions" style={{ marginTop: 10 }}>
              <Button variant="primary" onClick={() => complete.mutate(next)}>
                {next.type === 'waiting' ? t('work.resolve') : t('work.complete')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="quiet">{t('work.noNext')}</p>
            <Button variant="ghost" onClick={() => setPickOpen(true)}>
              {t('work.setNextShort')}
            </Button>
          </>
        )}
      </section>

      <section className="open-items">
        <div className="timeline-heading">
          <h2 className="section-label">{t('work.openItems')}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => setActionOpen(true)}>+ {t('work.addActionShort')}</Button>
            <Button onClick={() => setWaitingOpen(true)}>+ {t('work.addWaitingShort')}</Button>
          </div>
        </div>
        <h3 className="timeline-day-label">{t('work.actions')}</h3>
        {openActions.length === 0 ? <p className="muted">{t('work.noOpenActions')}</p> : null}
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
        <h3 className="timeline-day-label">{t('work.waiting')}</h3>
        {openWaiting.length === 0 ? <p className="muted">{t('work.notWaiting')}</p> : null}
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
              {t('work.completedClosed', { count: closed.length })}
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
        title={t('work.pickTitle')}
        actions={<DialogCloseButton />}
      >
        <Button onClick={() => { setPickOpen(false); setActionOpen(true) }}>+ {t('work.newActionShort')}</Button>
        <Button onClick={() => { setPickOpen(false); setWaitingOpen(true) }}>+ {t('work.newWaitingShort')}</Button>
        {[...openActions, ...openWaiting].map((item) => (
          <button key={item.id} type="button" className="combobox-item" onClick={() => { setPickOpen(false); requestNext(item) }}>
            {item.type === 'waiting' ? t('work.waitingDash', { title: item.title }) : item.title}
          </button>
        ))}
      </Dialog>
      <Dialog
        open={Boolean(replaceTarget)}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null)
        }}
        title={t('work.replaceTitle')}
        description={
          next && replaceTarget && replaceNextLabel
            ? t('work.replaceBody', { current: next.title, next: replaceNextLabel })
            : undefined
        }
        actions={
          <>
            <DialogCloseButton />
            <Button variant="primary" onClick={() => replaceTarget && setNext.mutate(replaceTarget.id)}>
              {t('work.replace')}
            </Button>
          </>
        }
      >
        <p className="quiet">{replaceTarget?.title}</p>
      </Dialog>
    </>
  )
}

function message(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}
