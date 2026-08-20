import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { MatterDocument, PickedFile } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Field'
import { useT } from '@/i18n/LocaleProvider'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { AddDocumentDialog } from './AddDocumentDialog'
import { DocumentRow } from './DocumentRow'

export function MatterDocuments({ matterId }: { matterId: string }) {
  const t = useT()
  const toast = useToast()
  const queryClient = useQueryClient()
  const docs = useQuery({ queryKey: ['documents', matterId], queryFn: () => api.documents.listForMatter(matterId) })
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [editing, setEditing] = useState<MatterDocument | null>(null)
  const [removing, setRemoving] = useState<MatterDocument | null>(null)
  const [picking, setPicking] = useState(false)

  const invalidate = async () => {
    await queryClient.invalidateQueries()
  }

  const open = useMutation({
    mutationFn: (id: string) => api.documents.open(id),
    onError: (error) => toast.push(messageFrom(error, t('documents.actionFailed')), 'error')
  })
  const reveal = useMutation({
    mutationFn: (id: string) => api.documents.reveal(id),
    onError: (error) => toast.push(messageFrom(error, t('documents.actionFailed')), 'error')
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.documents.remove(id),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('documents.removed'))
      setRemoving(null)
    },
    onError: (error) => toast.push(messageFrom(error, t('documents.actionFailed')), 'error')
  })
  const saveNotes = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.documents.update(id, { notes }),
    onSuccess: async () => {
      await invalidate()
      toast.push(t('documents.notesSaved'))
      setEditing(null)
    },
    onError: (error) => toast.push(messageFrom(error, t('documents.actionFailed')), 'error')
  })

  async function addDocument() {
    setPicking(true)
    try {
      const next = await api.documents.pick()
      if (next) setPicked(next)
    } catch (error) {
      toast.push(messageFrom(error, t('documents.actionFailed')), 'error')
    } finally {
      setPicking(false)
    }
  }

  async function relink(id: string) {
    try {
      const next = await api.documents.pick()
      if (!next) return
      await api.documents.relink(id, { path: next.path })
      await invalidate()
      toast.push(t('documents.locationUpdated'))
    } catch (error) {
      toast.push(messageFrom(error, t('documents.actionFailed')), 'error')
    }
  }

  async function copyPath(doc: MatterDocument) {
    if (!doc.resolvedPath) return
    try {
      await navigator.clipboard.writeText(doc.resolvedPath)
      toast.push(t('documents.pathCopied'))
    } catch {
      toast.push(t('documents.pathCopyFailed'), 'error')
    }
  }

  return (
    <section className="open-items">
      <div className="timeline-heading">
        <h2 className="section-label">{t('documents.title')}</h2>
        <Button onClick={() => void addDocument()} disabled={picking}>
          + {t('documents.add')}
        </Button>
      </div>
      {(docs.data?.length ?? 0) === 0 ? <p className="muted">{t('documents.emptyAttached')}</p> : null}
      {docs.data?.map((document) => (
        <DocumentRow
          key={document.id}
          document={document}
          onOpen={() => open.mutate(document.id)}
          onReveal={() => reveal.mutate(document.id)}
          onCopyPath={() => void copyPath(document)}
          onEditNotes={() => setEditing(document)}
          onRelink={() => void relink(document.id)}
          onRemove={() => setRemoving(document)}
        />
      ))}

      <AddDocumentDialog open={Boolean(picked)} matterId={matterId} picked={picked} onClose={() => setPicked(null)} />

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(next) => {
          if (!next) setEditing(null)
        }}
        title={t('documents.editNotesTitle')}
        actions={
          <>
            <DialogCloseButton />
            <Button
              variant="primary"
              onClick={() => editing && saveNotes.mutate({ id: editing.id, notes: editing.notes ?? '' })}
              disabled={saveNotes.isPending}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('common.notes')} htmlFor="edit-document-notes">
          <Textarea
            id="edit-document-notes"
            value={editing?.notes ?? ''}
            onChange={(event) => setEditing((current) => (current ? { ...current, notes: event.target.value } : current))}
          />
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(removing)}
        onOpenChange={(next) => {
          if (!next) setRemoving(null)
        }}
        title={t('documents.removeTitle')}
        description={
          removing?.storageMode === 'copy' ? t('documents.removeCopyBody') : t('documents.removeRefBody')
        }
        actions={
          <>
            <DialogCloseButton />
            <Button variant="danger" onClick={() => removing && remove.mutate(removing.id)} disabled={remove.isPending}>
              {t('common.remove')}
            </Button>
          </>
        }
      >
        <p className="quiet">{removing?.displayName}</p>
      </Dialog>
    </section>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}
