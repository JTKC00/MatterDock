import { useState } from 'react'
import { PRIORITY_LABELS, type WorkItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const waiting = item.type === 'waiting'
  const due = dueLabel(item.dueAt, new Date(), waiting)
  const closed = item.status !== 'open'

  return (
    <article className="work-card">
      <div className="work-card-top">
        <div>
          {waiting ? (
            <div className="work-kicker">Waiting for {item.waitingForDisplay ?? 'someone'}</div>
          ) : null}
          <div className="entity-title">{item.title}</div>
          <div className="work-meta">
            {due ? <span className={due.startsWith('Overdue') ? 'overdue' : undefined}>{due}</span> : null}
            {!waiting && (item.priority === 'high' || item.priority === 'urgent') ? (
              <span className={`badge badge-${item.priority}`}>{PRIORITY_LABELS[item.priority]}</span>
            ) : null}
            {waiting && item.waitingSince ? <span>Since {formatDateTime(item.waitingSince)}</span> : null}
            {item.isNextAction ? <span className="next-pill">Next action</span> : null}
          </div>
        </div>
        {!closed ? (
          <div className="work-card-actions">
            <Button variant="secondary" onClick={onPrimary}>
              {waiting ? 'Resolve' : 'Complete'}
            </Button>
            <button type="button" className="icon-btn timeline-more-btn" aria-label="Item actions" onClick={() => setMenuOpen((value) => !value)}>
              •••
            </button>
          </div>
        ) : (
          <Button variant="ghost" onClick={onReopen}>
            Reopen
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
              Clear Next Action
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
              Set as Next Action
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
            Edit
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
            Cancel
          </button>
        </div>
      ) : null}
    </article>
  )
}
