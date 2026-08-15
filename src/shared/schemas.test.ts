import { describe, expect, it } from 'vitest'
import {
  aliasSchema,
  createContactSchema,
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
