import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MatterListItem } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useT } from '@/i18n/LocaleProvider'
import { api, UserFacingError } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { useToast } from '@/lib/toast'
import { invalidateMatterLifecycleCaches } from './lifecycleCache'
import { PermanentDeleteDialog } from './PermanentDeleteDialog'

export function TrashPage() {
  const t = useT()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const matters = useQuery({
    queryKey: ['matters', { scope: 'trash', search, status: 'all' }],
    queryFn: () => api.matters.list({ scope: 'trash', status: 'all', search })
  })

  const restore = useMutation({
    mutationFn: (id: string) => api.matters.restoreFromTrash(id),
    onSuccess: async (matter) => {
      await invalidateMatterLifecycleCaches(queryClient, matter.id, matter)
      toast.push(t('trash.restoreSuccess'))
    },
    onError: (error) => toast.push(messageFrom(error, t('trash.restoreFailed')), 'error')
  })

  const deletePermanently = useMutation({
    mutationFn: (id: string) => api.matters.deletePermanently(id),
    onSuccess: async (_result, id) => {
      await invalidateMatterLifecycleCaches(queryClient, id)
      setPendingId(null)
      toast.push(t('matters.deleteSuccess'))
    },
    onError: (error) => toast.push(messageFrom(error, t('matters.deleteFailed')), 'error')
  })

  const countLabel = useMemo(() => {
    const count = matters.data?.length ?? 0
    return count === 1 ? t('trash.countOne') : t('trash.countMany', { count })
  }, [matters.data, t])

  const pendingMatter = matters.data?.find((matter) => matter.id === pendingId) ?? null

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('trash.title')}</h1>
          <p className="page-subtitle">{matters.isLoading ? t('common.loading') : countLabel}</p>
        </div>
      </header>
      <p className="muted" style={{ margin: '0 0 12px' }}>
        {t('trash.subtitle')}
      </p>
      <div className="toolbar">
        <div className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('trash.searchPlaceholder')}
            aria-label={t('trash.searchAria')}
          />
        </div>
      </div>
      <div className="scroll">
        {matters.isError ? (
          <EmptyState title={t('trash.loadErrorTitle')}>{t('trash.loadErrorBody')}</EmptyState>
        ) : !matters.isLoading && (matters.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('trash.emptyTitle')}>{t('trash.emptyBody')}</EmptyState>
        ) : (
          <div className="matter-list">
            {(matters.data ?? []).map((matter) => (
              <TrashRow
                key={matter.id}
                matter={matter}
                restorePending={restore.isPending && restore.variables === matter.id}
                deletePending={deletePermanently.isPending && deletePermanently.variables === matter.id}
                onRestore={() => restore.mutate(matter.id)}
                onDelete={() => setPendingId(matter.id)}
              />
            ))}
          </div>
        )}
      </div>
      {pendingMatter ? (
        <PermanentDeleteDialog
          open
          title={pendingMatter.title}
          pending={deletePermanently.isPending}
          onOpenChange={(open) => {
            if (!open && !deletePermanently.isPending) setPendingId(null)
          }}
          onConfirm={() => deletePermanently.mutate(pendingMatter.id)}
        />
      ) : null}
    </div>
  )
}

function TrashRow({
  matter,
  restorePending,
  deletePending,
  onRestore,
  onDelete
}: {
  matter: MatterListItem
  restorePending: boolean
  deletePending: boolean
  onRestore: () => void
  onDelete: () => void
}) {
  const t = useT()
  const busy = restorePending || deletePending
  return (
    <div className="matter-row trash-row">
      <div className="matter-row-top">
        <div>
          <div className="matter-title">{matter.title}</div>
          <div className="matter-org">{matter.organisationName ?? t('trash.noOrganisation')}</div>
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
        {matter.trashedAt ? <span>{t('trash.movedOn', { date: formatDateTime(matter.trashedAt) })}</span> : null}
      </div>
      <div className="trash-row-actions">
        <Button onClick={onRestore} disabled={busy}>
          {restorePending ? t('trash.restoring') : t('trash.restore')}
        </Button>
        <Button variant="danger" onClick={onDelete} disabled={busy}>
          {t('matters.deletePermanently')}
        </Button>
      </div>
    </div>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}
