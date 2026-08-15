import type { EventDirection, EventType, TimelineEvent } from '@shared/types'

export function eventHeading(event: TimelineEvent): string {
  switch (event.type) {
    case 'note':
      return 'Note'
    case 'phone':
      return event.direction === 'incoming' ? 'Incoming call' : 'Outgoing call'
    case 'email':
      return event.direction === 'incoming' ? 'Email received' : 'Email sent'
    case 'whatsapp':
      return event.direction === 'incoming' ? 'WhatsApp received' : 'WhatsApp sent'
    case 'meeting':
      return event.title?.trim() ? event.title : 'Meeting'
    case 'letter':
      return event.direction === 'incoming' ? 'Letter received' : 'Letter sent'
  }
}

export function directionFieldLabel(type: EventType): { incoming: string; outgoing: string } {
  if (type === 'phone') return { incoming: 'Incoming', outgoing: 'Outgoing' }
  return { incoming: 'Received', outgoing: 'Sent' }
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
