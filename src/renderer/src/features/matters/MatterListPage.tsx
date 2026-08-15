import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MATTER_STATUSES, STATUS_LABELS, type MatterSort, type MatterStatus } from '@shared/types'
import { useAppActions } from '@/app/AppContext'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/lib/api'
import { formatRelativeDate } from '@/lib/dates'

export function MatterListPage() {
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
    return count === 1 ? '1 matter' : `${count} matters`
  }, [matters.data])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Matters</h1>
          <p className="page-subtitle">{matters.isLoading ? 'Loading…' : countLabel}</p>
        </div>
        <Button variant="primary" onClick={openNewMatter}>
          <Plus />
          New Matter
        </Button>
      </header>
      <div className="toolbar">
        <div className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search matters..."
            aria-label="Search matters"
          />
        </div>
        <div className="filter">
          <label htmlFor="status-filter">Status</label>
          <Select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="active">All</option>
            {MATTER_STATUSES.map((item) => (
              <option key={item} value={item}>
                {STATUS_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>
        <div className="filter">
          <label htmlFor="tag-filter">Tag</label>
          <Select id="tag-filter" value={tagId} onChange={(event) => setTagId(event.target.value)}>
            <option value="">All</option>
            {(tags.data ?? []).map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="filter">
          <label htmlFor="sort-filter">Sort</label>
          <Select id="sort-filter" value={sort} onChange={(event) => setSort(event.target.value as MatterSort)}>
            <option value="updated">Updated</option>
            <option value="created">Created</option>
            <option value="title">Title</option>
            <option value="priority">Priority</option>
          </Select>
        </div>
      </div>
      <div className="scroll">
        {matters.isError ? (
          <EmptyState title="Matters could not be loaded">
            MatterDock could not read the local database. Please try again.
          </EmptyState>
        ) : !matters.isLoading && (matters.data?.length ?? 0) === 0 ? (
          <EmptyState title="No matters yet" action={<Button onClick={openNewMatter}>New Matter</Button>}>
            Create a matter in a few seconds. A title is enough to get it on the list.
          </EmptyState>
        ) : (
          <div className="matter-list">
            {(matters.data ?? []).map((matter) => (
              <Link key={matter.id} to={`/matters/${matter.id}`} className="matter-row">
                <div className="matter-row-top">
                  <div>
                    <div className="matter-title">{matter.title}</div>
                    <div className="matter-org">{matter.organisationName ?? 'No organisation'}</div>
                  </div>
                  <StatusBadge status={matter.status} />
                </div>
                <div className="matter-meta">
                  {matter.reference ? <span>Reference: {matter.reference}</span> : null}
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
