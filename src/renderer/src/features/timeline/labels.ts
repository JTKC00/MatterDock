import type { EventDirection, EventType, TimelineEvent } from '@shared/types'
import { t } from '@/i18n/runtime'

export function eventHeading(event: TimelineEvent): string {
  switch (event.type) {
    case 'note':
      return t('timeline.note')
    case 'phone':
      return event.direction === 'incoming' ? t('timeline.incomingCall') : t('timeline.outgoingCall')
    case 'email':
      return event.direction === 'incoming' ? t('timeline.emailReceived') : t('timeline.emailSent')
    case 'whatsapp':
      return event.direction === 'incoming' ? t('timeline.whatsappReceived') : t('timeline.whatsappSent')
    case 'meeting':
      return event.title?.trim() ? event.title : t('timeline.meeting')
    case 'letter':
      return event.direction === 'incoming' ? t('timeline.letterReceived') : t('timeline.letterSent')
  }
}

export function directionFieldLabel(type: EventType): { incoming: string; outgoing: string } {
  if (type === 'phone') return { incoming: t('timeline.incoming'), outgoing: t('timeline.outgoing') }
  return { incoming: t('timeline.received'), outgoing: t('timeline.sent') }
}

export function usesDirection(type: EventType): boolean {
  return type === 'phone' || type === 'email' || type === 'whatsapp' || type === 'letter'
}

export function defaultDirection(type: EventType): EventDirection {
  if (type === 'note' || type === 'meeting') return 'internal'
  return 'outgoing'
}

export function previewText(value: string | null, max = 220): { text: string; truncated: boolean } {
  if (!value) return { text: '', truncated: false }
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return { text: compact, truncated: false }
  return { text: `${compact.slice(0, max).trim()}…`, truncated: true }
}
