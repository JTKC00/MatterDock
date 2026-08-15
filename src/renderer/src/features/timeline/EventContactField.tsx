import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { MatterContact } from '@shared/types'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { api } from '@/lib/api'

export function EventContactField({
  matterContacts,
  query,
  selectedId,
  onQueryChange,
  onSelect
}: {
  matterContacts: MatterContact[]
  query: string
  selectedId: string | null
  onQueryChange: (value: string) => void
  onSelect: (id: string | null, name: string) => void
}) {
  const contacts = useQuery({
    queryKey: ['contacts', 'search', query],
    queryFn: () => api.contacts.search(query)
  })

  const matterIds = useMemo(() => new Set(matterContacts.map((contact) => contact.contactId)), [matterContacts])
  const others = (contacts.data ?? []).filter((contact) => !matterIds.has(contact.id))

  return (
    <Field label="Contact">
      {matterContacts.length > 0 ? (
        <div className="contact-priority" role="list">
          <div className="details-label">Matter contacts</div>
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
          if (!value.trim()) onSelect(null, '')
        }}
        options={others.map((contact) => ({
          id: contact.id,
          label: contact.name,
          hint: contact.organisationName ?? contact.email ?? undefined
        }))}
        placeholder="Search other contacts"
        emptyLabel="No matching contact"
        createLabel={query.trim() ? `Create new contact “${query.trim()}”` : undefined}
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
