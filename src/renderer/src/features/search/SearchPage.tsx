import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SearchResults } from './SearchResults'

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search.global(debounced),
    enabled: debounced.length > 0
  })

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Search</h1>
          <p className="page-subtitle">Find a matter, person, activity or document you already recorded.</p>
        </div>
      </header>
      <div className="toolbar">
        <div className="search-field" style={{ flex: 1 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search matters, contacts, activity and documents…"
            aria-label="Search MatterDock"
            autoFocus
          />
        </div>
      </div>
      <div className="scroll">
        {debounced.length === 0 ? (
          <p className="muted">Start typing to search MatterDock.</p>
        ) : results.isLoading ? (
          <p className="muted">Searching…</p>
        ) : results.data ? (
          <SearchResults result={results.data} />
        ) : (
          <p className="muted">Search could not be completed.</p>
        )}
      </div>
    </div>
  )
}
