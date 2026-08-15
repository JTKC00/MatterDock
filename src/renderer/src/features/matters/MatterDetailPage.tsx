import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  MATTER_PRIORITIES,
  MATTER_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type MatterPriority,
  type MatterStatus
} from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Field'
import { PriorityBadge, StatusBadge } from '@/components/ui/StatusBadge'
import { api, UserFacingError } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { useToast } from '@/lib/toast'
import { MatterDocuments } from '@/features/documents/MatterDocuments'
import { MatterTimeline } from '@/features/timeline/MatterTimeline'
import { MatterWork } from '@/features/tasks/MatterWork'

export function MatterDetailPage() {
  const { matterId = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const matter = useQuery({
    queryKey: ['matter', matterId],
    queryFn: () => api.matters.get(matterId),
    enabled: Boolean(matterId)
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries()
  }

  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.matters.update>[1]) => api.matters.update(matterId, input),
    onSuccess: async () => {
      await invalidate()
      toast.push('Matter saved.')
    },
    onError: (error) => toast.push(messageFrom(error, 'Matter could not be saved. Your changes have not been lost. Please try again.'), 'error')
  })

  const archive = useMutation({
    mutationFn: () => api.matters.archive(matterId),
    onSuccess: async () => {
      await invalidate()
      toast.push('Matter archived.')
      navigate('/matters')
    },
    onError: (error) => toast.push(messageFrom(error, 'Matter could not be archived.'), 'error')
  })

  const restore = useMutation({
    mutationFn: () => api.matters.restore(matterId),
    onSuccess: async () => {
      await invalidate()
      toast.push('Matter restored.')
    },
    onError: (error) => toast.push(messageFrom(error, 'Matter could not be restored.'), 'error')
  })

  if (matter.isError) {
    return (
      <div className="page">
        <EmptyState title="Matter could not be opened">This matter could not be found in the local database.</EmptyState>
      </div>
    )
  }

  if (!matter.data) {
    return (
      <div className="page">
        <p className="page-header muted">Opening matter…</p>
      </div>
    )
  }

  const item = matter.data

  return (
    <div className="page">
      <div className="split-page">
        <section className="matter-main">
          <div className="matter-kicker">
            <button type="button" className="back-link" onClick={() => navigate('/matters')}>
              Matters
            </button>
            <StatusBadge status={item.status} />
          </div>
          <h1 className="matter-heading">{item.title}</h1>
          <div className="muted">{item.organisationName ?? 'No organisation linked'}</div>

          <MatterWork matterId={item.id} matterContacts={item.contacts} />
          <MatterDocuments matterId={item.id} />
          <MatterTimeline matterId={item.id} matterContacts={item.contacts} />
        </section>

        <aside className="details-panel">
          <h2 className="section-label">Details</h2>
          <div className="details-block">
            <div className="details-label">Status</div>
            <Select
              aria-label="Status"
              value={item.status}
              onChange={(event) => update.mutate({ status: event.target.value as MatterStatus })}
            >
              {MATTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className="details-block">
            <div className="details-label">Priority</div>
            <Select
              aria-label="Priority"
              value={item.priority}
              onChange={(event) => update.mutate({ priority: event.target.value as MatterPriority })}
            >
              {MATTER_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
            {item.priority === 'high' || item.priority === 'urgent' ? (
              <div style={{ marginTop: 8 }}>
                <PriorityBadge priority={item.priority} />
              </div>
            ) : null}
          </div>
          <OrganisationField
            organisationId={item.organisationId}
            organisationName={item.organisationName}
            onChange={(organisationId) => update.mutate({ organisationId })}
          />
          <ReferenceField
            value={item.reference}
            onSave={(reference) => update.mutate({ reference })}
          />
          <ContactsField matterId={item.id} />
          <TagsField
            tags={item.tags.map((tag) => tag.name)}
            onSave={(tagNames) =>
              api.matters.setTags(item.id, tagNames).then(async () => {
                await invalidate()
                toast.push('Tags updated.')
              })
            }
          />
          <div className="details-block">
            <div className="details-label">Created</div>
            <div className="details-value">{formatDateTime(item.createdAt)}</div>
          </div>
          <div className="details-block">
            <div className="details-label">Updated</div>
            <div className="details-value">{formatDateTime(item.updatedAt)}</div>
          </div>
          <div className="details-block">
            {item.status === 'archived' ? (
              <Button onClick={() => restore.mutate()}>Restore</Button>
            ) : (
              <Button variant="ghost" onClick={() => archive.mutate()}>
                Archive
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function OrganisationField({
  organisationId,
  organisationName,
  onChange
}: {
  organisationId: string | null
  organisationName: string | null
  onChange: (organisationId: string | null) => void
}) {
  const [query, setQuery] = useState(organisationName ?? '')
  const organisations = useQuery({
    queryKey: ['organisations', 'search', query],
    queryFn: () => api.organisations.list(query)
  })

  return (
    <div className="details-block">
      <div className="details-label">Organisation</div>
      <Combobox
        value={organisationId ?? undefined}
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          if (value.trim().length === 0) onChange(null)
        }}
        options={(organisations.data ?? []).map((org) => ({
          id: org.id,
          label: org.name,
          hint: org.aliases.map((alias) => alias.alias).slice(0, 3).join(' · ')
        }))}
        placeholder="Search organisations"
        emptyLabel="No matching organisation"
        createLabel={query.trim() ? `Create organisation “${query.trim()}”` : undefined}
        onSelect={(id) => {
          const selected = organisations.data?.find((org) => org.id === id)
          setQuery(selected?.name ?? query)
          onChange(id)
        }}
        onCreate={async (name) => {
          const created = await api.organisations.create({ name })
          setQuery(created.name)
          onChange(created.id)
        }}
      />
    </div>
  )
}

function ReferenceField({ value, onSave }: { value: string | null; onSave: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  return (
    <div className="details-block">
      <div className="details-label">Reference</div>
      <Input
        aria-label="Reference"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== (value ?? '')) onSave(draft)
        }}
        placeholder="None"
      />
    </div>
  )
}

function TagsField({ tags, onSave }: { tags: string[]; onSave: (tagNames: string[]) => Promise<void> }) {
  const [draft, setDraft] = useState('')
  const toast = useToast()

  async function addTag() {
    const name = draft.trim()
    if (!name) return
    try {
      await onSave([...tags, name])
      setDraft('')
    } catch (error) {
      toast.push(messageFrom(error, 'Tags could not be updated.'), 'error')
    }
  }

  return (
    <div className="details-block">
      <div className="details-label">Tags</div>
      <div className="chip-row">
        {tags.length === 0 ? <span className="muted">No tags</span> : null}
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="tag"
            onClick={() => void onSave(tags.filter((item) => item !== tag))}
            title="Remove tag"
          >
            {tag}
          </button>
        ))}
      </div>
      <form
        className="inline-form"
        style={{ marginTop: 8 }}
        onSubmit={(event) => {
          event.preventDefault()
          void addTag()
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add tag"
          aria-label="Add tag"
        />
        <Button type="submit">Add</Button>
      </form>
    </div>
  )
}

function ContactsField({ matterId }: { matterId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const matter = useQuery({ queryKey: ['matter', matterId], queryFn: () => api.matters.get(matterId) })
  const contacts = useQuery({
    queryKey: ['contacts', 'search', query],
    queryFn: () => api.contacts.search(query),
    enabled: open
  })

  const linkedIds = useMemo(
    () => new Set(matter.data?.contacts.map((contact) => contact.contactId) ?? []),
    [matter.data]
  )

  const link = useMutation({
    mutationFn: async () => {
      let contactId = selectedId
      if (!contactId && query.trim()) {
        const created = await api.contacts.create({ name: query.trim() })
        contactId = created.id
      }
      if (!contactId) throw new UserFacingError('Choose or create a contact first.')
      return api.matters.linkContact({ matterId, contactId, role })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push('Contact linked.')
      setOpen(false)
      setQuery('')
      setRole('')
      setSelectedId(null)
    },
    onError: (error) => toast.push(messageFrom(error, 'The contact could not be linked to this matter.'), 'error')
  })

  const unlink = useMutation({
    mutationFn: (contactId: string) => api.matters.unlinkContact(matterId, contactId),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push('Contact unlinked.')
    },
    onError: (error) => toast.push(messageFrom(error, 'The contact could not be unlinked.'), 'error')
  })

  return (
    <div className="details-block">
      <div className="details-label">Contacts</div>
      {(matter.data?.contacts.length ?? 0) === 0 ? <div className="muted">No contacts yet</div> : null}
      {matter.data?.contacts.map((contact) => (
        <div key={contact.contactId} className="person-row">
          <div>
            <Link to={`/contacts/${contact.contactId}`}>{contact.name}</Link>
            <div className="muted">
              {[contact.role, contact.organisationName].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={() => unlink.mutate(contact.contactId)} aria-label={`Unlink ${contact.name}`}>
            ×
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => setOpen(true)}>
        + Add Contact
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add contact"
        description="Search for an existing person, or create a new contact and link them to this matter."
        actions={
          <>
            <DialogCloseButton />
            <Button variant="primary" onClick={() => link.mutate()} disabled={link.isPending}>
              Link contact
            </Button>
          </>
        }
      >
        <Field label="Contact">
          <Combobox
            query={query}
            onQueryChange={(value) => {
              setQuery(value)
              setSelectedId(null)
            }}
            options={(contacts.data ?? [])
              .filter((contact) => !linkedIds.has(contact.id))
              .map((contact) => ({
                id: contact.id,
                label: contact.name,
                hint: contact.organisationName ?? contact.email ?? undefined
              }))}
            placeholder="Search contacts"
            emptyLabel="No matching contact"
            createLabel={query.trim() ? `Create new contact “${query.trim()}”` : undefined}
            onSelect={(id) => {
              const selected = contacts.data?.find((contact) => contact.id === id)
              setSelectedId(id)
              setQuery(selected?.name ?? query)
            }}
            onCreate={(name) => {
              setSelectedId(null)
              setQuery(name)
            }}
          />
        </Field>
        <Field label="Role" htmlFor="contact-role">
          <Input
            id="contact-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Optional, e.g. Case Officer"
          />
        </Field>
      </Dialog>
    </div>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}
