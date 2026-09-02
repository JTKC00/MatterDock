import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { useT } from '@/i18n/LocaleProvider'

export function PermanentDeleteDialog({
  open,
  title,
  pending,
  onOpenChange,
  onConfirm
}: {
  open: boolean
  title: string
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
      title={t('matters.deleteTitle', { title })}
      description={t('matters.deleteDescription')}
      actions={
        <>
          <DialogCloseButton disabled={pending} />
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? t('matters.deleting') : t('matters.deletePermanently')}
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
  )
}
