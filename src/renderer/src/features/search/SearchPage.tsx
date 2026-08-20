import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/LocaleProvider'
import { api } from '@/lib/api'
import { SearchResults } from './SearchResults'

export function SearchPage() {
  const t = useT()
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
          <h1 className="page-title">{t('search.title')}</h1>
          <p className="page-subtitle">{t('search.subtitle')}</p>
        </div>
      </header>
      <div className="toolbar">
        <div className="search-field" style={{ flex: 1 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.aria')}
            autoFocus
          />
        </div>
      </div>
      <div className="scroll">
        {debounced.length === 0 ? (
          <p className="muted">{t('search.start')}</p>
        ) : results.isLoading ? (
          <p className="muted">{t('search.searching')}</p>
        ) : results.data ? (
          <SearchResults result={results.data} />
        ) : (
          <p className="muted">{t('search.failed')}</p>
        )}
      </div>
    </div>
  )
}
