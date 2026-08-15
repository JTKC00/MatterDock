import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { WorkItem } from '@shared/types'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { dueLabel } from './dueLabels'

export function WaitingPage() {
  const board = useQuery({ queryKey: ['waiting-board'], queryFn: () => api.tasks.listWaiting() })

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Waiting</h1>
          <p className="page-subtitle">Things you have already done, now waiting on someone else.</p>
        </div>
      </header>
      <div className="scroll">
        <Section title="Follow-up due" items={board.data?.followUpDue ?? []} empty="No follow-ups due." />
        <Section title="Upcoming" items={board.data?.upcoming ?? []} empty="No upcoming follow-ups." />
        <Section title="No follow-up date" items={board.data?.noFollowUp ?? []} empty="Every waiting item has a follow-up date, or none are open." />
      </div>
    </div>
  )
}

function Section({ title, items, empty }: { title: string; items: WorkItem[]; empty: string }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="section-label">{title}</h2>
      {items.length === 0 ? <p className="muted">{empty}</p> : null}
      {items.map((item) => (
        <Link key={item.id} to={`/matters/${item.matterId}`} className="entity-row">
          <div className="entity-title">{item.matterTitle}</div>
          <div className="entity-meta">
            Waiting for {item.waitingForDisplay ?? 'someone'}
            <div>{item.title}</div>
          </div>
          <div className="muted">
            {item.waitingSince ? `Waiting since ${formatDateTime(item.waitingSince)}` : null}
            {item.dueAt ? ` · ${dueLabel(item.dueAt, new Date(), true)}` : ''}
          </div>
        </Link>
      ))}
    </section>
  )
}
