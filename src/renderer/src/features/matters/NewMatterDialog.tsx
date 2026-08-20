import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MATTER_STATUSES, type MatterStatus } from '@shared/types'
import { useAppActions } from '@/app/AppContext'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { useT } from '@/i18n/LocaleProvider'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function NewMatterDialog() {
  const { newMatterOpen, closeNewMatter } = useAppActions()
  if (!newMatterOpen) return null
  return <NewMatterForm onClose={closeNewMatter} />
}

function NewMatterForm({ onClose }: { onClose: () => void }) {
  const t = useT()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [reference, setReference] = useState('')
  const [status, setStatus] = useState<MatterStatus>('new')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgQuery, setOrgQuery] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const organisations = useQuery({
    queryKey: ['organisations', 'search', orgQuery],
    queryFn: () => api.organisations.list(orgQuery)
  })

  const create = useMutation({
    mutationFn: () =>
      api.matters.create({
        title,
        organisationId: orgId,
        organisationName: orgId ? undefined : orgQuery,
        reference,
        status,
        tagNames: tagInput
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      }),
    onSuccess: async (matter) => {
      await queryClient.invalidateQueries()
      toast.push(t('matters.created'))
      onClose()
      navigate(`/matters/${matter.id}`)
    },
    onError: (cause) => {
      const message =
        cause instanceof UserFacingError
          ? cause.message
          : t('matters.saveFailed')
      setError(message)
      toast.push(message, 'error')
    }
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('matters.newTitle')}
      description={t('matters.newDescription')}
      actions={
        <>
          <DialogCloseButton />
          <Button
            variant="primary"
            onClick={() => create.mutate()}
            disabled={create.isPending || title.trim().length === 0}
          >
            {t('matters.createMatter')}
          </Button>
        </>
      }
    >
      <Field label={t('common.title')} htmlFor="matter-title" error={error ?? undefined}>
        <Input
          id="matter-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('matters.titlePlaceholder')}
        />
      </Field>
      <Field label={t('common.organisation')} htmlFor="matter-org">
        <Combobox
          query={orgQuery}
          onQueryChange={(value) => {
            setOrgQuery(value)
            setOrgId(null)
          }}
          options={(organisations.data ?? []).map((org) => ({
            id: org.id,
            label: org.name,
            hint: org.aliases
              .slice(0, 3)
              .map((alias) => alias.alias)
              .join(' · ')
          }))}
          placeholder={t('matters.orgPlaceholder')}
          emptyLabel={t('matters.noOrgMatch')}
          createLabel={orgQuery.trim() ? t('matters.createOrg', { name: orgQuery.trim() }) : undefined}
          onSelect={(id) => {
            const selected = organisations.data?.find((org) => org.id === id)
            setOrgId(id)
            setOrgQuery(selected?.name ?? orgQuery)
          }}
          onCreate={(name) => {
            setOrgId(null)
            setOrgQuery(name)
          }}
        />
      </Field>
      <Field label={t('common.reference')} htmlFor="matter-reference">
        <Input
          id="matter-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder={t('matters.referencePlaceholder')}
        />
      </Field>
      <Field label={t('common.status')} htmlFor="matter-status">
        <Select id="matter-status" value={status} onChange={(event) => setStatus(event.target.value as MatterStatus)}>
          {MATTER_STATUSES.filter((item) => item !== 'archived').map((item) => (
            <option key={item} value={item}>
              {t(`status.${item}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('common.tags')} htmlFor="matter-tags">
        <Input
          id="matter-tags"
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          placeholder={t('matters.tagsPlaceholder')}
        />
      </Field>
    </Dialog>
  )
}
