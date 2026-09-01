import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useT } from '@/i18n/LocaleProvider'

type Toast = { id: number; message: string; tone: 'ok' | 'error' }
const MAX_VISIBLE_TOASTS = 3

type ToastContextValue = {
  push: (message: string, tone?: Toast['tone']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const t = useT()

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((current) => {
      const withoutDuplicate =
        tone === 'ok' ? current.filter((toast) => toast.tone !== 'ok' || toast.message !== message) : current
      return [...withoutDuplicate, { id, message, tone }].slice(-MAX_VISIBLE_TOASTS)
    })
    window.setTimeout(() => {
      dismiss(id)
    }, 3800)
  }, [dismiss])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={toast.tone === 'error' ? 'toast error' : 'toast'}>
            <span className="toast-message">{toast.message}</span>
            <button type="button" className="toast-dismiss" aria-label={t('common.dismissNotification')} onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('ToastProvider is missing')
  return value
}
