import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SearchHit } from '@shared/types'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { api } from '@/lib/api'
import { SearchResultRow } from './SearchResults'

export function GlobalSearchDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [query])

  const recent = useQuery({
    queryKey: ['matters', 'search-recent'],
    queryFn: () => api.matters.list({ status: 'active', sort: 'updated' }),
    enabled: open && debounced.length === 0
  })

  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search.global(debounced),
    enabled: open && debounced.length > 0
  })

  const hits = useMemo<SearchHit[]>(() => {
    if (debounced.length > 0) return results.data?.hits ?? []
    return (recent.data ?? []).slice(0, 8).map((matter) => ({
      id: matter.id,
      type: 'matter' as const,
      label: 'Matter',
      title: matter.title,
      subtitle: matter.organisationName ?? 'Recent matter',
      snippet: null,
      href: `/matters/${matter.id}`,
      matterId: matter.id,
      matterTitle: matter.title,
      archived: matter.status === 'archived',
      score: 0
    }))
  }, [debounced, recent.data, results.data])

  const selected = hits.length === 0 ? 0 : Math.min(active, hits.length - 1)

  function go(hit: SearchHit) {
    onClose()
    navigate(hit.href)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Search MatterDock"
      actions={<DialogCloseButton />}
    >
      <input
        className="input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search matters, contacts, activity and documents…"
        aria-label="Search MatterDock"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((value) => Math.min(hits.length - 1, value + 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((value) => Math.max(0, value - 1))
          }
          if (event.key === 'Enter' && hits[selected]) {
            event.preventDefault()
            go(hits[selected])
          }
        }}
      />
      <div className="search-overlay-results">
        {debounced.length === 0 && hits.length === 0 ? (
          <p className="muted">Start typing to search MatterDock.</p>
        ) : null}
        {hits.map((hit, index) => (
          <SearchResultRow key={`${hit.type}-${hit.id}`} hit={hit} active={index === selected} onSelect={go} />
        ))}
      </div>
    </Dialog>
  )
}
