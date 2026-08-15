import { PRIORITY_LABELS, STATUS_LABELS, type MatterPriority, type MatterStatus } from '@shared/types'

export function StatusBadge({ status }: { status: MatterStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>
}

export function PriorityBadge({ priority }: { priority: MatterPriority }) {
  if (priority === 'normal' || priority === 'low') {
    return <span className="badge">{PRIORITY_LABELS[priority]}</span>
  }
  return <span className={`badge badge-${priority}`}>{PRIORITY_LABELS[priority]}</span>
}
