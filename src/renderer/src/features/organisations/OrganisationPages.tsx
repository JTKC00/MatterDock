import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function OrganisationListPage() {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const organisations = useQuery({
    queryKey: ['organisations', search],
    queryFn: () => api.organisations.list(search)
  })

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Organisations</h1>
          <p className="page-subtitle">Canonical names and the aliases people actually use.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus />
          New Organisation
        </Button>
      </header>
      <div className="toolbar">
        <div className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search organisations or aliases"
            aria-label="Search organisations"
          />
        </div>
      </div>
      <div className="scroll">
        {(organisations.data?.length ?? 0) === 0 && !organisations.isLoading ? (
          <EmptyState title="No organisations yet" action={<Button onClick={() => setOpen(true)}>New Organisation</Button>}>
            Add the government departments, companies and bodies that appear in your matters.
          </EmptyState>
        ) : (
          <div className="entity-list">
            {(organisations.data ?? []).map((org) => (
              <Link key={org.id} to={`/organisations/${org.id}`} className="entity-row">
                <div className="entity-row-top">
                  <div>
                    <div className="entity-title">{org.name}</div>
                    <div className="entity-meta">
                      {org.aliases.length > 0
                        ? org.aliases
                            .slice(0, 4)
                            .map((alias) => alias.alias)
                            .join(' · ')
                        : 'No aliases'}
                    </div>
                  </div>
                  <span className="muted">
                    {org.activeMatterCount} active {org.activeMatterCount === 1 ? 'matter' : 'matters'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <OrganisationFormDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

export function OrganisationDetailPage() {
  const { organisationId = '' } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [alias, setAlias] = useState('')
  const [editing, setEditing] = useState(false)
  const organisation = useQuery({
    queryKey: ['organisation', organisationId],
    queryFn: () => api.organisations.get(organisationId),
    enabled: Boolean(organisationId)
  })

  const addAlias = useMutation({
    mutationFn: () => api.organisations.addAlias(organisationId, alias),
    onSuccess: async () => {
      setAlias('')
      await queryClient.invalidateQueries()
      toast.push('Alias added.')
    },
    onError: (error) => toast.push(messageFrom(error, 'That alias could not be added.'), 'error')
  })

  const removeAlias = useMutation({
    mutationFn: (id: string) => api.organisations.removeAlias(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push('Alias removed.')
    },
    onError: (error) => toast.push(messageFrom(error, 'That alias could not be removed.'), 'error')
  })

  const remove = useMutation({
    mutationFn: () => api.organisations.remove(organisationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push('Organisation removed.')
      navigate('/organisations')
    },
    onError: (error) => toast.push(messageFrom(error, 'This organisation could not be deleted.'), 'error')
  })

  if (organisation.isError) {
    return (
      <div className="page">
        <EmptyState title="Organisation could not be opened">This organisation could not be found.</EmptyState>
      </div>
    )
  }
  if (!organisation.data) {
    return (
      <div className="page">
        <p className="page-header muted">Opening organisation…</p>
      </div>
    )
  }

  const item = organisation.data

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <button type="button" className="back-link" onClick={() => navigate('/organisations')}>
            Organisations
          </button>
          <h1 className="page-title">{item.name}</h1>
          <p className="page-subtitle">{item.activeMatterCount} active matters</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="ghost" onClick={() => remove.mutate()}>
            Delete
          </Button>
        </div>
      </header>
      <div className="scroll" style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr 1fr' }}>
        <section>
          <h2 className="section-label">Aliases</h2>
          <form
            className="inline-form"
            style={{ marginBottom: 10 }}
            onSubmit={(event) => {
              event.preventDefault()
              addAlias.mutate()
            }}
          >
            <Input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="Add alias, e.g. 中電"
              aria-label="New alias"
            />
            <Button type="submit">Add Alias</Button>
          </form>
          <div className="alias-list">
            {item.aliases.length === 0 ? <p className="muted">No aliases yet.</p> : null}
            {item.aliases.map((entry) => (
              <div key={entry.id} className="alias-item">
                <span>{entry.alias}</span>
                <button type="button" className="icon-btn" onClick={() => removeAlias.mutate(entry.id)} aria-label={`Remove ${entry.alias}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <h2 className="section-label" style={{ marginTop: 24 }}>
            Contacts
          </h2>
          <div className="stack-list">
            {item.contacts.length === 0 ? <p className="muted">No contacts from this organisation.</p> : null}
            {item.contacts.map((contact) => (
              <Link key={contact.id} to={`/contacts/${contact.id}`} className="stack-item">
                <span>{contact.name}</span>
                <span className="muted">{contact.jobTitle}</span>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h2 className="section-label">Active matters</h2>
          <div className="stack-list">
            {item.activeMatters.length === 0 ? <p className="muted">No active matters.</p> : null}
            {item.activeMatters.map((matter) => (
              <Link key={matter.id} to={`/matters/${matter.id}`} className="stack-item">
                <span>{matter.title}</span>
                <StatusBadge status={matter.status} />
              </Link>
            ))}
          </div>
          <h2 className="section-label" style={{ marginTop: 24 }}>
            Completed / previous matters
          </h2>
          <div className="stack-list">
            {item.previousMatters.length === 0 ? <p className="muted">No completed or archived matters.</p> : null}
            {item.previousMatters.map((matter) => (
              <Link key={matter.id} to={`/matters/${matter.id}`} className="stack-item">
                <span>{matter.title}</span>
                <StatusBadge status={matter.status} />
              </Link>
            ))}
          </div>
        </section>
      </div>
      <OrganisationFormDialog
        open={editing}
        onOpenChange={setEditing}
        organisationId={item.id}
        initialName={item.name}
        initialNotes={item.notes ?? ''}
      />
    </div>
  )
}

function OrganisationFormDialog({
  open,
  onOpenChange,
  organisationId,
  initialName = '',
  initialNotes = ''
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organisationId?: string
  initialName?: string
  initialNotes?: string
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialName)
  const [notes, setNotes] = useState(initialNotes)

  const save = useMutation({
    mutationFn: () =>
      organisationId
        ? api.organisations.update(organisationId, { name, notes })
        : api.organisations.create({ name, notes }),
    onSuccess: async (org) => {
      await queryClient.invalidateQueries()
      toast.push(organisationId ? 'Organisation saved.' : 'Organisation created.')
      onOpenChange(false)
      if (!organisationId) navigate(`/organisations/${org.id}`)
    },
    onError: (error) =>
      toast.push(messageFrom(error, 'Organisation could not be saved. Your changes have not been lost. Please try again.'), 'error')
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(initialName)
          setNotes(initialNotes)
        }
        onOpenChange(next)
      }}
      title={organisationId ? 'Edit organisation' : 'New organisation'}
      description="Use the official or canonical name. Aliases can be added afterwards."
      actions={
        <>
          <DialogCloseButton />
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || name.trim().length === 0}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Canonical name" htmlFor="org-name">
        <Input id="org-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </Field>
      <Field label="Notes" htmlFor="org-notes">
        <Textarea id="org-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
    </Dialog>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}
