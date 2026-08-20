import { Link } from 'react-router-dom'
import type { TranslateVars } from '@shared/i18n'
import type { SearchHit, SearchResponse } from '@shared/types'
import { useT } from '@/i18n/LocaleProvider'

type Translate = (key: string, vars?: TranslateVars) => string

const GROUP_KEYS: Record<string, string> = {
  matters: 'search.groupMatters',
  activity: 'search.groupActivity',
  work: 'search.groupWork',
  people: 'search.groupPeople',
  documents: 'search.groupDocuments'
}

const EVENT_KINDS = new Set(['note', 'phone', 'email', 'whatsapp', 'meeting', 'letter'])

function groupLabel(key: string, fallback: string, t: Translate): string {
  const messageKey = GROUP_KEYS[key]
  return messageKey ? t(messageKey) : fallback
}

function hitLabel(hit: SearchHit, t: Translate): string {
  switch (hit.type) {
    case 'matter':
      return t('search.hitMatter')
    case 'organisation':
      return t('search.hitOrganisation')
    case 'contact':
      return t('search.hitContact')
    case 'event':
      return hit.kind && EVENT_KINDS.has(hit.kind) ? t(`timeline.${hit.kind}`) : t('search.hitActivity')
    case 'task':
      return hit.kind === 'waiting' ? t('search.hitWaiting') : t('search.hitAction')
    case 'document':
      return hit.label
    default:
      return hit.label
  }
}

function hitSubtitle(hit: SearchHit, t: Translate): string {
  if (hit.type === 'organisation') {
    if (hit.subtitle.startsWith('Aliases: ')) {
      return t('search.aliases', { list: hit.subtitle.slice('Aliases: '.length) })
    }
    if (hit.subtitle === 'Organisation') {
      return t('search.hitOrganisation')
    }
  }
  if (hit.type === 'document') {
    const kindLabel = hit.kind === 'copy' ? t('documents.copy') : t('documents.reference')
    return hit.matterTitle ? `${kindLabel} · ${hit.matterTitle}` : kindLabel
  }
  return hit.subtitle
}

export function SearchResults({
  result,
  activeId,
  onSelect
}: {
  result: SearchResponse
  activeId?: string | null
  onSelect?: (hit: SearchHit) => void
}) {
  const t = useT()
  if (result.groups.length === 0) {
    return <p className="muted">{t('search.empty')}</p>
  }

  return (
    <div>
      {result.groups.map((group) => (
        <section key={group.key} style={{ marginBottom: 22 }}>
          <h2 className="section-label">{groupLabel(group.key, group.label, t)}</h2>
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
  const t = useT()
  const className = active ? 'entity-row search-hit active' : 'entity-row search-hit'
  const body = (
    <>
      <div className="kicker-line">
        {hitLabel(hit, t)}
        {hit.archived ? ` · ${t('search.archived')}` : ''}
        {hit.fileUnavailable ? ` · ${t('search.fileUnavailable')}` : ''}
      </div>
      <div className="entity-title">{hit.title}</div>
      <div className="entity-meta">{hitSubtitle(hit, t)}</div>
      {hit.snippet ? <div className="muted">{t('search.matched', { snippet: hit.snippet })}</div> : null}
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
