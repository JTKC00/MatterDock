import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function ContactListPage() {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const contacts = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => api.contacts.list(search)
  })

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">People involved in matters, with or without an organisation.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus />
          New Contact
        </Button>
      </header>
      <div className="toolbar">
        <div className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts"
            aria-label="Search contacts"
          />
        </div>
      </div>
      <div className="scroll">
        {(contacts.data?.length ?? 0) === 0 && !contacts.isLoading ? (
          <EmptyState title="No contacts yet" action={<Button onClick={() => setOpen(true)}>New Contact</Button>}>
            Add people as they appear. They can stay independent or belong to an organisation.
          </EmptyState>
        ) : (
          <div className="entity-list">
            {(contacts.data ?? []).map((contact) => (
              <Link key={contact.id} to={`/contacts/${contact.id}`} className="entity-row">
                <div className="entity-row-top">
                  <div>
                    <div className="entity-title">{contact.name}</div>
                    <div className="entity-meta">
                      {[contact.jobTitle, contact.organisationName].filter(Boolean).join(' · ') || 'No organisation'}
                    </div>
                  </div>
                  <span className="muted">
                    {contact.matterCount} {contact.matterCount === 1 ? 'matter' : 'matters'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <ContactFormDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

export function ContactDetailPage() {
  const { contactId = '' } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const contact = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => api.contacts.get(contactId),
    enabled: Boolean(contactId)
  })

  const remove = useMutation({
    mutationFn: () => api.contacts.remove(contactId),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push('Contact deleted.')
      navigate('/contacts')
    },
    onError: (error) => toast.push(messageFrom(error, 'This contact could not be deleted.'), 'error')
  })

  if (contact.isError) {
    return (
      <div className="page">
        <EmptyState title="Contact could not be opened">This contact could not be found.</EmptyState>
      </div>
    )
  }
  if (!contact.data) {
    return (
      <div className="page">
        <p className="page-header muted">Opening contact…</p>
      </div>
    )
  }

  const item = contact.data

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <button type="button" className="back-link" onClick={() => navigate('/contacts')}>
            Contacts
          </button>
          <h1 className="page-title">{item.name}</h1>
          <p className="page-subtitle">{item.organisationName ?? 'Independent contact'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="ghost" onClick={() => remove.mutate()}>
            Delete
          </Button>
        </div>
      </header>
      <div className="scroll" style={{ display: 'grid', gap: 24, gridTemplateColumns: '280px 1fr' }}>
        <section>
          <div className="details-block">
            <div className="details-label">Job title</div>
            <div>{item.jobTitle ?? '—'}</div>
          </div>
          <div className="details-block">
            <div className="details-label">Phone</div>
            <div>{item.phone ?? '—'}</div>
          </div>
          <div className="details-block">
            <div className="details-label">Email</div>
            <div>{item.email ?? '—'}</div>
          </div>
          <div className="details-block">
            <div className="details-label">Notes</div>
            <div>{item.notes ?? '—'}</div>
          </div>
        </section>
        <section>
          <h2 className="section-label">Related matters</h2>
          <div className="stack-list">
            {item.relatedMatters.length === 0 ? <p className="muted">Not linked to any matters yet.</p> : null}
            {item.relatedMatters.map((matter) => (
              <Link key={matter.id} to={`/matters/${matter.id}`} className="stack-item">
                <div>
                  <div>{matter.title}</div>
                  <div className="muted">{[matter.role, matter.organisationName].filter(Boolean).join(' · ')}</div>
                </div>
                <StatusBadge status={matter.status} />
              </Link>
            ))}
          </div>
        </section>
      </div>
      <ContactFormDialog
        open={editing}
        onOpenChange={setEditing}
        contactId={item.id}
        initial={{
          name: item.name,
          organisationId: item.organisationId,
          organisationName: item.organisationName,
          jobTitle: item.jobTitle ?? '',
          phone: item.phone ?? '',
          email: item.email ?? '',
          notes: item.notes ?? ''
        }}
      />
    </div>
  )
}

function ContactFormDialog({
  open,
  onOpenChange,
  contactId,
  initial
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId?: string
  initial?: {
    name: string
    organisationId: string | null
    organisationName: string | null
    jobTitle: string
    phone: string
    email: string
    notes: string
  }
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial?.name ?? '')
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [orgId, setOrgId] = useState<string | null>(initial?.organisationId ?? null)
  const [orgQuery, setOrgQuery] = useState(initial?.organisationName ?? '')
  const organisations = useQuery({
    queryKey: ['organisations', 'search', orgQuery],
    queryFn: () => api.organisations.list(orgQuery),
    enabled: open
  })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        organisationId: orgId,
        jobTitle,
        phone,
        email,
        notes
      }
      return contactId ? api.contacts.update(contactId, payload) : api.contacts.create(payload)
    },
    onSuccess: async (contact) => {
      await queryClient.invalidateQueries()
      toast.push(contactId ? 'Contact saved.' : 'Contact created.')
      onOpenChange(false)
      if (!contactId) navigate(`/contacts/${contact.id}`)
    },
    onError: (error) =>
      toast.push(messageFrom(error, 'Contact could not be saved. Your changes have not been lost. Please try again.'), 'error')
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && initial) {
          setName(initial.name)
          setJobTitle(initial.jobTitle)
          setPhone(initial.phone)
          setEmail(initial.email)
          setNotes(initial.notes)
          setOrgId(initial.organisationId)
          setOrgQuery(initial.organisationName ?? '')
        }
        onOpenChange(next)
      }}
      title={contactId ? 'Edit contact' : 'New contact'}
      actions={
        <>
          <DialogCloseButton />
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || name.trim().length === 0}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name" htmlFor="contact-name">
        <Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </Field>
      <Field label="Organisation">
        <Combobox
          query={orgQuery}
          onQueryChange={(value) => {
            setOrgQuery(value)
            if (!value.trim()) setOrgId(null)
          }}
          options={(organisations.data ?? []).map((org) => ({ id: org.id, label: org.name }))}
          placeholder="Optional organisation"
          emptyLabel="No matching organisation"
          onSelect={(id) => {
            const selected = organisations.data?.find((org) => org.id === id)
            setOrgId(id)
            setOrgQuery(selected?.name ?? orgQuery)
          }}
        />
      </Field>
      <Field label="Job title" htmlFor="contact-title">
        <Input id="contact-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
      </Field>
      <Field label="Phone" htmlFor="contact-phone">
        <Input id="contact-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </Field>
      <Field label="Email" htmlFor="contact-email">
        <Input id="contact-email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="contact-notes">
        <Textarea id="contact-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
    </Dialog>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}
