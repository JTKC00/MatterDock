import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { isOverdue } from '@shared/day'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/lib/api'
import { formatRelativeDate } from '@/lib/dates'
import { dueLabel } from './dueLabels'

export function TodayPage() {
  const today = useQuery({ queryKey: ['today'], queryFn: () => api.tasks.today() })
  const data = today.data

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-subtitle">What needs attention, and what you are waiting on.</p>
        </div>
      </header>
      <div className="scroll">
        <div className="today-summary">
          <span>Overdue {data?.summary.overdue ?? 0}</span>
          <span>Due today {data?.summary.dueToday ?? 0}</span>
          <span>Waiting {data?.summary.waiting ?? 0}</span>
        </div>
        <h2 className="section-label">Needs attention</h2>
        {(data?.needsAttention.length ?? 0) === 0 ? <p className="muted">Nothing is due right now.</p> : null}
        {data?.needsAttention.map((item) => (
          <Link key={item.id} to={`/matters/${item.matterId}`} className="entity-row">
            <div className="kicker-line">{isOverdue(item.dueAt) ? 'Overdue' : 'Today'}</div>
            <div className="entity-title">{item.matterTitle}</div>
            <div className="entity-meta">
              {item.type === 'waiting' ? `Waiting for ${item.waitingForDisplay ?? 'someone'} · ${item.title}` : item.title}
            </div>
            <div className="muted">{dueLabel(item.dueAt, new Date(), item.type === 'waiting')}</div>
          </Link>
        ))}
        <div className="timeline-heading" style={{ marginTop: 24 }}>
          <h2 className="section-label">Waiting</h2>
          <Link to="/waiting" className="back-link">
            View all Waiting
          </Link>
        </div>
        {(data?.waiting.length ?? 0) === 0 ? <p className="muted">You are not waiting on anyone.</p> : null}
        {data?.waiting.map((item) => (
          <Link key={item.id} to={`/matters/${item.matterId}`} className="entity-row">
            <div className="entity-title">{item.matterTitle}</div>
            <div className="entity-meta">
              Waiting for {item.waitingForDisplay ?? 'someone'} · {item.title}
            </div>
          </Link>
        ))}
        <h2 className="section-label" style={{ marginTop: 24 }}>
          Recent matters
        </h2>
        {data?.recentMatters.map((matter) => (
          <Link key={matter.id} to={`/matters/${matter.id}`} className="entity-row">
            <div className="entity-row-top">
              <div>
                <div className="entity-title">{matter.title}</div>
                <div className="entity-meta">{matter.organisationName ?? 'No organisation'}</div>
              </div>
              <StatusBadge status={matter.status} />
            </div>
            <div className="muted">{formatRelativeDate(matter.updatedAt)}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
