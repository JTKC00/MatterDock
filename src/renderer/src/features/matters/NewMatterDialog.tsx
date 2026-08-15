import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MATTER_STATUSES, STATUS_LABELS, type MatterStatus } from '@shared/types'
import { useAppActions } from '@/app/AppContext'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function NewMatterDialog() {
  const { newMatterOpen, closeNewMatter } = useAppActions()
  if (!newMatterOpen) return null
  return <NewMatterForm onClose={closeNewMatter} />
}

function NewMatterForm({ onClose }: { onClose: () => void }) {
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
      toast.push('Matter created.')
      onClose()
      navigate(`/matters/${matter.id}`)
    },
    onError: (cause) => {
      const message =
        cause instanceof UserFacingError
          ? cause.message
          : 'Matter could not be saved. Your changes have not been lost. Please try again.'
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
      title="New matter"
      description="A title is enough. You can add the rest as the matter develops."
      actions={
        <>
          <DialogCloseButton />
          <Button
            variant="primary"
            onClick={() => create.mutate()}
            disabled={create.isPending || title.trim().length === 0}
          >
            Create matter
          </Button>
        </>
      }
    >
      <Field label="Title" htmlFor="matter-title" error={error ?? undefined}>
        <Input
          id="matter-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What is this matter about?"
        />
      </Field>
      <Field label="Organisation" htmlFor="matter-org">
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
          placeholder="Search or create an organisation"
          emptyLabel="No matching organisation"
          createLabel={orgQuery.trim() ? `Create organisation “${orgQuery.trim()}”` : undefined}
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
      <Field label="Reference" htmlFor="matter-reference">
        <Input
          id="matter-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Optional file or case reference"
        />
      </Field>
      <Field label="Status" htmlFor="matter-status">
        <Select id="matter-status" value={status} onChange={(event) => setStatus(event.target.value as MatterStatus)}>
          {MATTER_STATUSES.filter((item) => item !== 'archived').map((item) => (
            <option key={item} value={item}>
              {STATUS_LABELS[item]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tags" htmlFor="matter-tags">
        <Input
          id="matter-tags"
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          placeholder="HR, Government"
        />
      </Field>
    </Dialog>
  )
}
