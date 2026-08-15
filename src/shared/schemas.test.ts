import { describe, expect, it } from 'vitest'
import {
  aliasSchema,
  createContactSchema,
  createEventSchema,
  createMatterSchema,
  createOrganisationSchema,
  formatZodError
} from './schemas'

describe('createMatterSchema', () => {
  it('requires a title', () => {
    const result = createMatterSchema.safeParse({ title: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(formatZodError(result.error)).toContain('Title is required')
    }
  })

  it('accepts a title-only matter', () => {
    const result = createMatterSchema.parse({ title: '  EMPF Subsidy Application  ' })
    expect(result.title).toBe('EMPF Subsidy Application')
  })
})

describe('createOrganisationSchema', () => {
  it('requires a canonical name', () => {
    const result = createOrganisationSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })
})

describe('aliasSchema', () => {
  it('rejects blank aliases', () => {
    const result = aliasSchema.safeParse('   ')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(formatZodError(result.error)).toBe('Enter an alias before saving.')
    }
  })

  it('accepts CJK aliases', () => {
    expect(aliasSchema.parse('中電')).toBe('中電')
  })
})

describe('createContactSchema', () => {
  it('rejects invalid email when provided', () => {
    const result = createContactSchema.safeParse({
      name: 'Alex Chan',
      email: 'not-an-email'
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(formatZodError(result.error)).toBe('Enter a valid email address.')
    }
  })

  it('allows an empty email', () => {
    const result = createContactSchema.parse({ name: 'Alex Chan', email: '' })
    expect(result.email).toBeNull()
  })
})

describe('createEventSchema', () => {
  const matterId = '11111111-1111-1111-1111-111111111111'

  it('requires a note body', () => {
    expect(createEventSchema.safeParse({ matterId, type: 'note' }).success).toBe(false)
  })

  it('requires an email subject or body', () => {
    const empty = createEventSchema.safeParse({ matterId, type: 'email', direction: 'incoming' })
    expect(empty.success).toBe(false)
    const withSubject = createEventSchema.parse({
      matterId,
      type: 'email',
      direction: 'incoming',
      email: { subject: 'Request', fromAddress: '', toAddresses: '', ccAddresses: '' }
    })
    expect(withSubject.email?.subject).toBe('Request')
  })
})
