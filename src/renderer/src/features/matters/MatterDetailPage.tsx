import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  MATTER_PRIORITIES,
  MATTER_STATUSES,
  type MatterPriority,
  type MatterStatus
} from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Field'
import { PriorityBadge, StatusBadge } from '@/components/ui/StatusBadge'
import { useT } from '@/i18n/LocaleProvider'
import { api, UserFacingError } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { useToast } from '@/lib/toast'
import { PrepareContextDialog } from '@/features/context-export/PrepareContextDialog'
import { MatterDocuments } from '@/features/documents/MatterDocuments'
import { MatterTimeline } from '@/features/timeline/MatterTimeline'
import { MatterWork } from '@/features/tasks/MatterWork'

export function MatterDetailPage() {
  const t = useT()
  const { matterId = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [prepareOpen, setPrepareOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const matter = useQuery({
    queryKey: ['matter', matterId],
    queryFn: () => api.matters.get(matterId),
    enabled: Boolean(matterId)
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries()
  }

  const invalidateAfterPermanentDelete = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['matters'] }),
      queryClient.invalidateQueries({ queryKey: ['today'] }),
      queryClient.invalidateQueries({ queryKey: ['waiting-board'] }),
      queryClient.invalidateQueries({ queryKey: ['search'] }),
      queryClient.invalidateQueries({ queryKey: ['tags'] }),
      queryClient.invalidateQueries({ queryKey: ['organisations'] }),
      queryClient.invalidateQueries({ queryKey: ['organisation'] }),
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['contact'] })
    ])
    queryClient.removeQueries({ queryKey: ['matter', matterId] })
    queryClient.removeQueries({ queryKey: ['tasks', matterId] })
    queryClient.removeQueries({ queryKey: ['events', matterId] })
    queryClient.removeQueries({ queryKey: ['documents', matterId] })
    queryClient.removeQueries({ queryKey: ['context-preview', matterId] })
  }

  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.matters.update>[1]) => api.matters.update(matterId, input),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('matters.saved'))
    },
    onError: (error) => toast.push(messageFrom(error, t('matters.saveFailed')), 'error')
  })

  const archive = useMutation({
    mutationFn: () => api.matters.archive(matterId),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('matters.archived'))
      navigate('/matters')
    },
    onError: (error) => toast.push(messageFrom(error, t('matters.archiveFailed')), 'error')
  })

  const restore = useMutation({
    mutationFn: () => api.matters.restore(matterId),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('matters.restored'))
    },
    onError: (error) => toast.push(messageFrom(error, t('matters.restoreFailed')), 'error')
  })

  const deletePermanently = useMutation({
    mutationFn: () => api.matters.deletePermanently(matterId),
    onSuccess: async () => {
      await invalidateAfterPermanentDelete()
      setDeleteOpen(false)
      toast.push(t('matters.deleteSuccess'))
      navigate('/matters', { replace: true })
    },
    onError: (error) => toast.push(messageFrom(error, t('matters.deleteFailed')), 'error')
  })

  if (matter.isError) {
    return (
      <div className="page">
        <EmptyState title={t('matters.notFoundTitle')}>{t('matters.notFoundBody')}</EmptyState>
      </div>
    )
  }

  if (!matter.data) {
    return (
      <div className="page">
        <p className="page-header muted">{t('matters.opening')}</p>
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
              {t('matters.back')}
            </button>
            <StatusBadge status={item.status} />
          </div>
          <h1 className="matter-heading">{item.title}</h1>
          <div className="muted">{item.organisationName ?? t('matters.noOrgLinked')}</div>
          <div className="matter-toolbar">
            <Button onClick={() => setPrepareOpen(true)}>{t('matters.prepareContext')}</Button>
          </div>

          <MatterWork matterId={item.id} matterContacts={item.contacts} />
          <MatterDocuments matterId={item.id} />
          <MatterTimeline matterId={item.id} matterContacts={item.contacts} />
        </section>

        <aside className="details-panel">
          <h2 className="section-label">{t('matters.details')}</h2>
          <div className="details-block">
            <div className="details-label">{t('common.status')}</div>
            <Select
              aria-label={t('common.status')}
              value={item.status}
              onChange={(event) => update.mutate({ status: event.target.value as MatterStatus })}
            >
              {MATTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="details-block">
            <div className="details-label">{t('common.priority')}</div>
            <Select
              aria-label={t('common.priority')}
              value={item.priority}
              onChange={(event) => update.mutate({ priority: event.target.value as MatterPriority })}
            >
              {MATTER_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {t(`priority.${priority}`)}
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
                toast.push(t('matters.tagsUpdated'))
              })
            }
          />
          <div className="details-block">
            <div className="details-label">{t('common.created')}</div>
            <div className="details-value">{formatDateTime(item.createdAt)}</div>
          </div>
          <div className="details-block">
            <div className="details-label">{t('common.updated')}</div>
            <div className="details-value">{formatDateTime(item.updatedAt)}</div>
          </div>
          <div className="details-block">
            {item.status === 'archived' ? (
              <>
                <Button onClick={() => restore.mutate()} disabled={restore.isPending}>
                  {t('matters.restoreMatter')}
                </Button>
                <Button variant="danger" onClick={() => setDeleteOpen(true)} disabled={deletePermanently.isPending}>
                  {t('matters.deletePermanently')}
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => archive.mutate()}>
                {t('matters.archiveMatter')}
              </Button>
            )}
          </div>
        </aside>
      </div>
      {prepareOpen ? (
        <PrepareContextDialog open matterId={item.id} onClose={() => setPrepareOpen(false)} />
      ) : null}
      {deleteOpen ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!deletePermanently.isPending) setDeleteOpen(open)
          }}
          title={t('matters.deleteTitle', { title: item.title })}
          description={t('matters.deleteDescription')}
          actions={
            <>
              <DialogCloseButton disabled={deletePermanently.isPending} />
              <Button
                variant="danger"
                onClick={() => deletePermanently.mutate()}
                disabled={deletePermanently.isPending}
              >
                {deletePermanently.isPending ? t('matters.deleting') : t('matters.deletePermanently')}
              </Button>
            </>
          }
        >
          <p>{t('matters.deleteRemovesLabel')}</p>
          <ul>
            <li>{t('matters.deleteRemovesMatter')}</li>
            <li>{t('matters.deleteRemovesWork')}</li>
            <li>{t('matters.deleteRemovesTimeline')}</li>
            <li>{t('matters.deleteRemovesDocuments')}</li>
            <li>{t('matters.deleteRemovesCopies')}</li>
          </ul>
          <p>{t('matters.deleteKeepsLabel')}</p>
          <ul>
            <li>{t('matters.deleteKeepsOriginals')}</li>
            <li>{t('matters.deleteKeepsShared')}</li>
          </ul>
        </Dialog>
      ) : null}
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
  const t = useT()
  const [query, setQuery] = useState(organisationName ?? '')
  const organisations = useQuery({
    queryKey: ['organisations', 'search', query],
    queryFn: () => api.organisations.list(query)
  })

  return (
    <div className="details-block">
      <div className="details-label">{t('common.organisation')}</div>
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
        placeholder={t('matters.searchOrgs')}
        emptyLabel={t('matters.noOrgMatch')}
        createLabel={query.trim() ? t('matters.createOrg', { name: query.trim() }) : undefined}
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
  const t = useT()
  const [draft, setDraft] = useState(value ?? '')
  return (
    <div className="details-block">
      <div className="details-label">{t('common.reference')}</div>
      <Input
        aria-label={t('common.reference')}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== (value ?? '')) onSave(draft)
        }}
        placeholder={t('matters.none')}
      />
    </div>
  )
}

function TagsField({ tags, onSave }: { tags: string[]; onSave: (tagNames: string[]) => Promise<void> }) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const toast = useToast()

  async function addTag() {
    const name = draft.trim()
    if (!name) return
    try {
      await onSave([...tags, name])
      setDraft('')
    } catch (error) {
      toast.push(messageFrom(error, t('matters.tagsFailed')), 'error')
    }
  }

  return (
    <div className="details-block">
      <div className="details-label">{t('common.tags')}</div>
      <div className="chip-row">
        {tags.length === 0 ? <span className="muted">{t('matters.noTags')}</span> : null}
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="tag"
            onClick={() => void onSave(tags.filter((item) => item !== tag))}
            title={t('matters.removeTag')}
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
          placeholder={t('matters.addTag')}
          aria-label={t('matters.addTag')}
        />
        <Button type="submit">{t('common.add')}</Button>
      </form>
    </div>
  )
}

function ContactsField({ matterId }: { matterId: string }) {
  const t = useT()
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
      if (!contactId) throw new UserFacingError(t('matters.chooseContact'))
      return api.matters.linkContact({ matterId, contactId, role })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(t('matters.contactLinked'))
      setOpen(false)
      setQuery('')
      setRole('')
      setSelectedId(null)
    },
    onError: (error) => toast.push(messageFrom(error, t('matters.contactLinkFailed')), 'error')
  })

  const unlink = useMutation({
    mutationFn: (contactId: string) => api.matters.unlinkContact(matterId, contactId),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(t('matters.contactUnlinked'))
    },
    onError: (error) => toast.push(messageFrom(error, t('matters.contactUnlinkFailed')), 'error')
  })

  return (
    <div className="details-block">
      <div className="details-label">{t('common.contacts')}</div>
      {(matter.data?.contacts.length ?? 0) === 0 ? <div className="muted">{t('matters.noContactsYet')}</div> : null}
      {matter.data?.contacts.map((contact) => (
        <div key={contact.contactId} className="person-row">
          <div>
            <Link to={`/contacts/${contact.contactId}`}>{contact.name}</Link>
            <div className="muted">
              {[contact.role, contact.organisationName].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={() => unlink.mutate(contact.contactId)} aria-label={t('matters.unlinkAria', { name: contact.name })}>
            ×
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {t('contacts.addContact')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('matters.addContactTitle')}
        description={t('matters.addContactBody')}
        actions={
          <>
            <DialogCloseButton />
            <Button variant="primary" onClick={() => link.mutate()} disabled={link.isPending}>
              {t('contacts.linkContact')}
            </Button>
          </>
        }
      >
        <Field label={t('timeline.contact')}>
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
            placeholder={t('contacts.searchContacts')}
            emptyLabel={t('matters.noMatchingContact')}
            createLabel={query.trim() ? t('matters.createContact', { name: query.trim() }) : undefined}
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
        <Field label={t('contacts.role')} htmlFor="contact-role">
          <Input
            id="contact-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder={t('contacts.rolePlaceholder')}
          />
        </Field>
      </Dialog>
    </div>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}
