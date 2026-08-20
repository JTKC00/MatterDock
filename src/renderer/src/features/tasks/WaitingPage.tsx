import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { WorkItem } from '@shared/types'
import { useT } from '@/i18n/LocaleProvider'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { dueLabel } from './dueLabels'

export function WaitingPage() {
  const t = useT()
  const board = useQuery({ queryKey: ['waiting-board'], queryFn: () => api.tasks.listWaiting() })

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('waitingPage.title')}</h1>
          <p className="page-subtitle">{t('waitingPage.subtitle')}</p>
        </div>
      </header>
      <div className="scroll">
        <Section title={t('waitingPage.followUpDue')} items={board.data?.followUpDue ?? []} empty={t('waitingPage.emptyDue')} />
        <Section title={t('waitingPage.upcoming')} items={board.data?.upcoming ?? []} empty={t('waitingPage.emptyUpcoming')} />
        <Section title={t('waitingPage.noFollowUp')} items={board.data?.noFollowUp ?? []} empty={t('waitingPage.emptyNone')} />
      </div>
    </div>
  )
}

function Section({ title, items, empty }: { title: string; items: WorkItem[]; empty: string }) {
  const t = useT()
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="section-label">{title}</h2>
      {items.length === 0 ? <p className="muted">{empty}</p> : null}
      {items.map((item) => (
        <Link key={item.id} to={`/matters/${item.matterId}`} className="entity-row">
          <div className="entity-title">{item.matterTitle}</div>
          <div className="entity-meta">
            {t('waitingPage.waitingFor', { name: item.waitingForDisplay ?? t('common.someone') })}
            <div>{item.title}</div>
          </div>
          <div className="muted">
            {item.waitingSince ? t('waitingPage.waitingSince', { date: formatDateTime(item.waitingSince) }) : null}
            {item.dueAt ? ` · ${dueLabel(item.dueAt, new Date(), true)}` : ''}
          </div>
        </Link>
      ))}
    </section>
  )
}
