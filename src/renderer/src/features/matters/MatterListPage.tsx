import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MATTER_STATUSES, type MatterSort, type MatterStatus } from '@shared/types'
import { useAppActions } from '@/app/AppContext'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useT } from '@/i18n/LocaleProvider'
import { api } from '@/lib/api'
import { formatRelativeDate } from '@/lib/dates'

export function MatterListPage() {
  const t = useT()
  const { openNewMatter } = useAppActions()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'active' | MatterStatus | 'all'>('active')
  const [tagId, setTagId] = useState('')
  const [sort, setSort] = useState<MatterSort>('updated')

  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.tags.list() })
  const matters = useQuery({
    queryKey: ['matters', { search, status, tagId, sort }],
    queryFn: () =>
      api.matters.list({
        search,
        status,
        tagId: tagId || undefined,
        sort
      })
  })

  const countLabel = useMemo(() => {
    const count = matters.data?.length ?? 0
    return count === 1 ? t('matters.countOne') : t('matters.countMany', { count })
  }, [matters.data, t])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('matters.title')}</h1>
          <p className="page-subtitle">{matters.isLoading ? t('common.loading') : countLabel}</p>
        </div>
        <Button variant="primary" onClick={openNewMatter}>
          <Plus />
          {t('matters.newMatter')}
        </Button>
      </header>
      <div className="toolbar">
        <div className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('matters.searchPlaceholder')}
            aria-label={t('matters.searchAria')}
          />
        </div>
        <div className="filter">
          <label htmlFor="status-filter">{t('matters.statusFilter')}</label>
          <Select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="active">{t('common.all')}</option>
            {MATTER_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`status.${item}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="filter">
          <label htmlFor="tag-filter">{t('matters.tagFilter')}</label>
          <Select id="tag-filter" value={tagId} onChange={(event) => setTagId(event.target.value)}>
            <option value="">{t('common.all')}</option>
            {(tags.data ?? []).map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="filter">
          <label htmlFor="sort-filter">{t('matters.sortFilter')}</label>
          <Select id="sort-filter" value={sort} onChange={(event) => setSort(event.target.value as MatterSort)}>
            <option value="updated">{t('matters.sortUpdated')}</option>
            <option value="created">{t('matters.sortCreated')}</option>
            <option value="title">{t('matters.sortTitle')}</option>
            <option value="priority">{t('matters.sortPriority')}</option>
          </Select>
        </div>
      </div>
      <div className="scroll">
        {matters.isError ? (
          <EmptyState title={t('matters.loadErrorTitle')}>
            {t('matters.loadErrorBody')}
          </EmptyState>
        ) : !matters.isLoading && (matters.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('matters.emptyTitle')} action={<Button onClick={openNewMatter}>{t('matters.newMatter')}</Button>}>
            {t('matters.emptyBody')}
          </EmptyState>
        ) : (
          <div className="matter-list">
            {(matters.data ?? []).map((matter) => (
              <Link key={matter.id} to={`/matters/${matter.id}`} className="matter-row">
                <div className="matter-row-top">
                  <div>
                    <div className="matter-title">{matter.title}</div>
                    <div className="matter-org">{matter.organisationName ?? t('matters.noOrganisation')}</div>
                  </div>
                  <StatusBadge status={matter.status} />
                </div>
                <div className="matter-meta">
                  {matter.reference ? <span>{t('matters.referenceLabel', { reference: matter.reference })}</span> : null}
                  {matter.tags.map((tag) => (
                    <span key={tag.id} className="tag">
                      {tag.name}
                    </span>
                  ))}
                  <span>{formatRelativeDate(matter.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
