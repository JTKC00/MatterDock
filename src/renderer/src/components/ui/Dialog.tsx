import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { t } from '@/i18n/runtime'
import { Button } from './Button'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  wide = false
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  actions: ReactNode
  wide?: boolean
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay">
          <DialogPrimitive.Content
            className={wide ? 'dialog dialog-wide' : 'dialog'}
            aria-describedby={description ? undefined : undefined}
          >
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
            {children ? <div className="dialog-body">{children}</div> : null}
            <div className="dialog-actions">{actions}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function DialogCloseButton({ children, disabled = false }: { children?: ReactNode; disabled?: boolean }) {
  return (
    <DialogPrimitive.Close asChild>
      <Button variant="ghost" disabled={disabled}>
        {children ?? t('common.cancel')}
      </Button>
    </DialogPrimitive.Close>
  )
}
