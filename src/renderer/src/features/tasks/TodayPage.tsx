import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { attentionReason } from '@shared/day'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useT } from '@/i18n/LocaleProvider'
import { api } from '@/lib/api'
import { formatRelativeDate } from '@/lib/dates'
import { dueLabel } from './dueLabels'

export function TodayPage() {
  const t = useT()
  const today = useQuery({ queryKey: ['today'], queryFn: () => api.tasks.today() })
  const data = today.data

  function attention(item: Parameters<typeof attentionReason>[0]): string {
    const reason = attentionReason(item)
    if (reason === 'Overdue') return t('due.overdue')
    if (reason === 'Today') return t('due.today')
    if (reason === 'Urgent') return t('priority.urgent')
    if (reason === 'High priority') return t('priority.high')
    return t('today.needsAttention')
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('today.title')}</h1>
          <p className="page-subtitle">{t('today.subtitle')}</p>
        </div>
      </header>
      <div className="scroll">
        <div className="today-summary">
          <span>{t('today.overdueCount', { count: data?.summary.overdue ?? 0 })}</span>
          <span>{t('today.dueTodayCount', { count: data?.summary.dueToday ?? 0 })}</span>
          <span>{t('today.waitingCount', { count: data?.summary.waiting ?? 0 })}</span>
        </div>
        <h2 className="section-label">{t('today.needsAttention')}</h2>
        {(data?.needsAttention.length ?? 0) === 0 ? <p className="muted">{t('today.nothingDue')}</p> : null}
        {data?.needsAttention.map((item) => (
          <Link key={item.id} to={`/matters/${item.matterId}`} className="entity-row">
            <div className="kicker-line">{attention(item)}</div>
            <div className="entity-title">{item.matterTitle}</div>
            <div className="entity-meta">
              {item.type === 'waiting'
                ? t('today.waitingFor', { name: item.waitingForDisplay ?? t('common.someone'), title: item.title })
                : item.title}
            </div>
            <div className="muted">{dueLabel(item.dueAt, new Date(), item.type === 'waiting')}</div>
          </Link>
        ))}
        <div className="timeline-heading" style={{ marginTop: 24 }}>
          <h2 className="section-label">{t('today.waiting')}</h2>
          <Link to="/waiting" className="back-link">
            {t('today.viewAllWaiting')}
          </Link>
        </div>
        {(data?.waiting.length ?? 0) === 0 ? <p className="muted">{t('today.notWaiting')}</p> : null}
        {data?.waiting.map((item) => (
          <Link key={item.id} to={`/matters/${item.matterId}`} className="entity-row">
            <div className="entity-title">{item.matterTitle}</div>
            <div className="entity-meta">
              {t('today.waitingFor', { name: item.waitingForDisplay ?? t('common.someone'), title: item.title })}
            </div>
          </Link>
        ))}
        <h2 className="section-label" style={{ marginTop: 24 }}>
          {t('today.recentMatters')}
        </h2>
        {(data?.recentMatters.length ?? 0) === 0 ? (
          <div className="today-empty">
            <p className="muted">{t('today.noRecentMatters')}</p>
            <Link to="/matters" className="back-link">
              {t('today.viewMatters')}
            </Link>
          </div>
        ) : (
          data?.recentMatters.map((matter) => (
            <Link key={matter.id} to={`/matters/${matter.id}`} className="entity-row">
              <div className="entity-row-top">
                <div>
                  <div className="entity-title">{matter.title}</div>
                  <div className="entity-meta">{matter.organisationName ?? t('today.noOrganisation')}</div>
                </div>
                <StatusBadge status={matter.status} />
              </div>
              <div className="muted">{formatRelativeDate(matter.updatedAt)}</div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
