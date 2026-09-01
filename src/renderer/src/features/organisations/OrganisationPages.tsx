import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useT } from '@/i18n/LocaleProvider'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function OrganisationListPage() {
  const t = useT()
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
          <h1 className="page-title">{t('organisations.title')}</h1>
          <p className="page-subtitle">{t('organisations.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus />
          {t('organisations.new')}
        </Button>
      </header>
      <div className="toolbar">
        <div className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('organisations.searchPlaceholder')}
            aria-label={t('organisations.searchAria')}
          />
        </div>
      </div>
      <div className="scroll">
        {(organisations.data?.length ?? 0) === 0 && !organisations.isLoading ? (
          <EmptyState title={t('organisations.emptyTitle')} action={<Button onClick={() => setOpen(true)}>{t('organisations.new')}</Button>}>
            {t('organisations.emptyHint')}
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
                        : t('organisations.noAliases')}
                    </div>
                  </div>
                  <span className="muted">
                    {org.activeMatterCount === 1
                      ? t('organisations.activeMatterOne', { count: org.activeMatterCount })
                      : t('organisations.activeMatterMany', { count: org.activeMatterCount })}
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
  const t = useT()
  const { organisationId = '' } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [alias, setAlias] = useState('')
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
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
      toast.push(t('organisations.aliasAdded'))
    },
    onError: (error) => toast.push(messageFrom(error, t('organisations.aliasAddFailed')), 'error')
  })

  const removeAlias = useMutation({
    mutationFn: (id: string) => api.organisations.removeAlias(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(t('organisations.aliasRemoved'))
    },
    onError: (error) => toast.push(messageFrom(error, t('organisations.aliasRemoveFailed')), 'error')
  })

  const remove = useMutation({
    mutationFn: () => api.organisations.remove(organisationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.push(t('organisations.removed'))
      navigate('/organisations')
    },
    onError: (error) => toast.push(messageFrom(error, t('organisations.deleteFailed')), 'error')
  })

  if (organisation.isError) {
    return (
      <div className="page">
        <EmptyState title={t('organisations.notFoundTitle')}>{t('organisations.notFoundBody')}</EmptyState>
      </div>
    )
  }
  if (!organisation.data) {
    return (
      <div className="page">
        <p className="page-header muted">{t('organisations.opening')}</p>
      </div>
    )
  }

  const item = organisation.data

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <button type="button" className="back-link" onClick={() => navigate('/organisations')}>
            {t('organisations.title')}
          </button>
          <h1 className="page-title">{item.name}</h1>
          <p className="page-subtitle">
            {item.activeMatterCount === 1
              ? t('organisations.activeMatterOne', { count: item.activeMatterCount })
              : t('organisations.activeMatterMany', { count: item.activeMatterCount })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => setEditing(true)}>{t('common.edit')}</Button>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)} disabled={remove.isPending}>
            {t('common.delete')}
          </Button>
        </div>
      </header>
      <div className="scroll" style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr 1fr' }}>
        <section>
          <h2 className="section-label">{t('organisations.aliases')}</h2>
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
              placeholder={t('organisations.aliasPlaceholder')}
              aria-label={t('organisations.newAlias')}
            />
            <Button type="submit">{t('organisations.addAlias')}</Button>
          </form>
          <div className="alias-list">
            {item.aliases.length === 0 ? <p className="muted">{t('organisations.noAliasesYet')}</p> : null}
            {item.aliases.map((entry) => (
              <div key={entry.id} className="alias-item">
                <span>{entry.alias}</span>
                <button type="button" className="icon-btn" onClick={() => removeAlias.mutate(entry.id)} aria-label={`${t('common.remove')} ${entry.alias}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <h2 className="section-label" style={{ marginTop: 24 }}>
            {t('common.contacts')}
          </h2>
          <div className="stack-list">
            {item.contacts.length === 0 ? <p className="muted">{t('organisations.noContacts')}</p> : null}
            {item.contacts.map((contact) => (
              <Link key={contact.id} to={`/contacts/${contact.id}`} className="stack-item">
                <span>{contact.name}</span>
                <span className="muted">{contact.jobTitle}</span>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h2 className="section-label">{t('organisations.activeMatters')}</h2>
          <div className="stack-list">
            {item.activeMatters.length === 0 ? <p className="muted">{t('organisations.noActiveMatters')}</p> : null}
            {item.activeMatters.map((matter) => (
              <Link key={matter.id} to={`/matters/${matter.id}`} className="stack-item">
                <span>{matter.title}</span>
                <StatusBadge status={matter.status} />
              </Link>
            ))}
          </div>
          <h2 className="section-label" style={{ marginTop: 24 }}>
            {t('organisations.previousMatters')}
          </h2>
          <div className="stack-list">
            {item.previousMatters.length === 0 ? <p className="muted">{t('organisations.noPrevious')}</p> : null}
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
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('organisations.deleteTitle')}
        description={t('organisations.deleteBody')}
        actions={
          <>
            <DialogCloseButton />
            <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <strong>{item.name}</strong>
      </Dialog>
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
  const t = useT()
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
      toast.push(organisationId ? t('organisations.saved') : t('organisations.created'))
      onOpenChange(false)
      if (!organisationId) navigate(`/organisations/${org.id}`)
    },
    onError: (error) => toast.push(messageFrom(error, t('organisations.saveFailed')), 'error')
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
      title={organisationId ? t('organisations.editTitle') : t('organisations.newTitle')}
      description={t('organisations.formHelp')}
      actions={
        <>
          <DialogCloseButton />
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || name.trim().length === 0}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('organisations.canonicalName')} htmlFor="org-name">
        <Input id="org-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </Field>
      <Field label={t('organisations.notes')} htmlFor="org-notes">
        <Textarea id="org-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
    </Dialog>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}
