import { FileText, Mail, MessageCircle, NotebookPen, Phone, Users } from 'lucide-react'
import { useState } from 'react'
import type { EventType, TimelineEvent } from '@shared/types'
import { formatTime } from '@/lib/dates'
import { eventHeading, previewText } from './labels'

const icons: Record<EventType, typeof Phone> = {
  note: NotebookPen,
  phone: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  meeting: Users,
  letter: FileText
}

export function TimelineEventCard({
  event,
  onEdit,
  onDelete
}: {
  event: TimelineEvent
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const Icon = icons[event.type]
  const subject = event.type === 'email' ? event.email?.subject : event.title
  const preview = previewText(event.body)
  const showToggle = preview.truncated || Boolean(event.email?.fromAddress || event.email?.toAddresses)

  return (
    <article className="timeline-event">
      <div className="timeline-event-top">
        <button type="button" className="timeline-event-main" onClick={() => setExpanded((value) => !value)}>
          <span className="timeline-icon" aria-hidden="true">
            <Icon />
          </span>
          <div className="timeline-event-heading">{eventHeading(event)}</div>
          <time className="timeline-time" dateTime={event.occurredAt}>
            {formatTime(event.occurredAt)}
          </time>
        </button>
        <button
          type="button"
          className="icon-btn timeline-more-btn"
          aria-label="Activity actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          •••
        </button>
      </div>
      {menuOpen ? (
        <div className="combobox-menu timeline-actions-menu" role="menu">
          <button
            type="button"
            className="combobox-item"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onEdit()
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="combobox-item"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onDelete()
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      <button type="button" className="timeline-event-body" onClick={() => setExpanded((value) => !value)}>
        {event.contactName ? (
          <div className="timeline-contact">
            {event.contactName}
            {event.contactOrganisation ? <span className="muted"> · {event.contactOrganisation}</span> : null}
          </div>
        ) : null}
        {subject ? <div className="timeline-subject">{subject}</div> : null}
        {event.body ? <p className="timeline-preview">{expanded ? event.body : preview.text}</p> : null}
        {expanded && event.email ? (
          <dl className="timeline-email-meta">
            {event.email.fromAddress ? (
              <>
                <dt>From</dt>
                <dd>{event.email.fromAddress}</dd>
              </>
            ) : null}
            {event.email.toAddresses ? (
              <>
                <dt>To</dt>
                <dd>{event.email.toAddresses}</dd>
              </>
            ) : null}
            {event.email.ccAddresses ? (
              <>
                <dt>CC</dt>
                <dd>{event.email.ccAddresses}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {showToggle ? <span className="timeline-more">{expanded ? 'Show less' : 'Show more'}</span> : null}
      </button>
    </article>
  )
}
