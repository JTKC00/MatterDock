import { Link } from 'react-router-dom'
import type { SearchHit, SearchResponse } from '@shared/types'

export function SearchResults({
  result,
  activeId,
  onSelect
}: {
  result: SearchResponse
  activeId?: string | null
  onSelect?: (hit: SearchHit) => void
}) {
  if (result.groups.length === 0) {
    return <p className="muted">No matching matters, people, activity or documents.</p>
  }

  return (
    <div>
      {result.groups.map((group) => (
        <section key={group.key} style={{ marginBottom: 22 }}>
          <h2 className="section-label">{group.label}</h2>
          {group.hits.map((hit) => (
            <SearchResultRow key={`${hit.type}-${hit.id}`} hit={hit} active={activeId === hit.id} onSelect={onSelect} />
          ))}
        </section>
      ))}
    </div>
  )
}

export function SearchResultRow({
  hit,
  active,
  onSelect
}: {
  hit: SearchHit
  active?: boolean
  onSelect?: (hit: SearchHit) => void
}) {
  const className = active ? 'entity-row search-hit active' : 'entity-row search-hit'
  const body = (
    <>
      <div className="kicker-line">
        {hit.label}
        {hit.archived ? ' · Archived' : ''}
        {hit.fileUnavailable ? ' · File unavailable' : ''}
      </div>
      <div className="entity-title">{hit.title}</div>
      <div className="entity-meta">{hit.subtitle}</div>
      {hit.snippet ? <div className="muted">Matched: “{hit.snippet}”</div> : null}
    </>
  )

  if (onSelect) {
    return (
      <button type="button" className={className} onClick={() => onSelect(hit)}>
        {body}
      </button>
    )
  }

  return (
    <Link to={hit.href} className={className}>
      {body}
    </Link>
  )
}
