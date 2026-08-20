import type { MatterPriority, MatterStatus } from '@shared/types'
import { useT } from '@/i18n/LocaleProvider'

export function StatusBadge({ status }: { status: MatterStatus }) {
  const t = useT()
  return <span className={`badge badge-${status}`}>{t(`status.${status}`)}</span>
}

export function PriorityBadge({ priority }: { priority: MatterPriority }) {
  const t = useT()
  if (priority === 'normal' || priority === 'low') {
    return <span className="badge">{t(`priority.${priority}`)}</span>
  }
  return <span className={`badge badge-${priority}`}>{t(`priority.${priority}`)}</span>
}
