import { useState } from 'react'
import { isOverdue } from '@shared/day'
import type { WorkItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { useT } from '@/i18n/LocaleProvider'
import { formatDateTime } from '@/lib/dates'
import { dueLabel } from './dueLabels'

export function WorkItemCard({
  item,
  onPrimary,
  onSetNext,
  onClearNext,
  onEdit,
  onCancel,
  onReopen
}: {
  item: WorkItem
  onPrimary: () => void
  onSetNext: () => void
  onClearNext: () => void
  onEdit: () => void
  onCancel: () => void
  onReopen?: () => void
}) {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const waiting = item.type === 'waiting'
  const due = dueLabel(item.dueAt, new Date(), waiting)
  const closed = item.status !== 'open'

  return (
    <article className="work-card">
      <div className="work-card-top">
        <div>
          {waiting ? (
            <div className="work-kicker">
              {t('work.waitingPrefix', { name: item.waitingForDisplay ?? t('common.someone') })}
            </div>
          ) : null}
          <div className="entity-title">{item.title}</div>
          <div className="work-meta">
            {due ? <span className={isOverdue(item.dueAt) ? 'overdue' : undefined}>{due}</span> : null}
            {!waiting && (item.priority === 'high' || item.priority === 'urgent') ? (
              <span className={`badge badge-${item.priority}`}>{t(`priority.${item.priority}`)}</span>
            ) : null}
            {waiting && item.waitingSince ? <span>{t('work.since', { date: formatDateTime(item.waitingSince) })}</span> : null}
            {item.isNextAction ? <span className="next-pill">{t('work.nextPill')}</span> : null}
          </div>
        </div>
        {!closed ? (
          <div className="work-card-actions">
            <Button variant="secondary" onClick={onPrimary}>
              {waiting ? t('work.resolve') : t('work.complete')}
            </Button>
            <button type="button" className="icon-btn timeline-more-btn" aria-label={t('work.itemActions')} onClick={() => setMenuOpen((value) => !value)}>
              •••
            </button>
          </div>
        ) : (
          <Button variant="ghost" onClick={onReopen}>
            {t('work.reopen')}
          </Button>
        )}
      </div>
      {menuOpen && !closed ? (
        <div className="combobox-menu work-menu" role="menu">
          {item.isNextAction ? (
            <button
              type="button"
              className="combobox-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                onClearNext()
              }}
            >
              {t('work.clearNext')}
            </button>
          ) : (
            <button
              type="button"
              className="combobox-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                onSetNext()
              }}
            >
              {t('work.setNext')}
            </button>
          )}
          <button
            type="button"
            className="combobox-item"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onEdit()
            }}
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="combobox-item"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onCancel()
            }}
          >
            {t('work.cancelItem')}
          </button>
        </div>
      ) : null}
    </article>
  )
}
