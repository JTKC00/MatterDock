import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { MatterContact } from '@shared/types'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { useT } from '@/i18n/LocaleProvider'
import { api } from '@/lib/api'

import { selectedContactStillMatches } from './contactSelection'

export function EventContactField({
  matterContacts,
  query,
  selectedId,
  selectedName,
  onQueryChange,
  onSelect
}: {
  matterContacts: MatterContact[]
  query: string
  selectedId: string | null
  selectedName?: string | null
  onQueryChange: (value: string) => void
  onSelect: (id: string | null, name: string) => void
}) {
  const t = useT()
  const contacts = useQuery({
    queryKey: ['contacts', 'search', query],
    queryFn: () => api.contacts.search(query)
  })

  const matterIds = useMemo(() => new Set(matterContacts.map((contact) => contact.contactId)), [matterContacts])
  const others = (contacts.data ?? []).filter((contact) => !matterIds.has(contact.id))
  const trimmed = query.trim()

  return (
    <Field label={t('timeline.contact')}>
      {matterContacts.length > 0 ? (
        <div className="contact-priority" role="list">
          <div className="details-label">{t('timeline.matterContacts')}</div>
          {matterContacts.map((contact) => (
            <button
              key={contact.contactId}
              type="button"
              className={selectedId === contact.contactId ? 'combobox-item active' : 'combobox-item'}
              onClick={() => onSelect(contact.contactId, contact.name)}
            >
              {contact.name}
              {contact.organisationName ? <div className="muted">{contact.organisationName}</div> : null}
            </button>
          ))}
        </div>
      ) : null}
      <Combobox
        query={query}
        onQueryChange={(value) => {
          onQueryChange(value)
          if (!selectedContactStillMatches(value, selectedName ?? query)) {
            onSelect(null, value)
          }
        }}
        options={others.map((contact) => ({
          id: contact.id,
          label: contact.name,
          hint: contact.organisationName ?? contact.email ?? undefined
        }))}
        placeholder={t('timeline.searchOther')}
        emptyLabel={t('contacts.noMatchingContact')}
        createLabel={trimmed ? t('timeline.createContact', { name: trimmed }) : undefined}
        onSelect={(id) => {
          const selected = others.find((contact) => contact.id === id)
          onSelect(id, selected?.name ?? query)
        }}
        onCreate={async (name) => {
          const created = await api.contacts.create({ name })
          onSelect(created.id, created.name)
        }}
      />
    </Field>
  )
}
