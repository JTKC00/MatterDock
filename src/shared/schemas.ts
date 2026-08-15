import { z } from 'zod/v3'
import { MATTER_PRIORITIES, MATTER_STATUSES } from './types'
import { normalizeAlias, normalizeWhitespace } from './normalize'

const requiredName = (label: string, max = 200) =>
  z
    .string({ required_error: `${label} is required.` })
    .transform((value) => normalizeWhitespace(value))
    .pipe(
      z
        .string()
        .min(1, `${label} is required.`)
        .max(max, `${label} is too long.`)
    )

const optionalNote = (max = 4000) =>
  z
    .string()
    .max(max, 'That text is too long.')
    .transform((value) => {
      const trimmed = normalizeWhitespace(value)
      return trimmed.length === 0 ? null : trimmed
    })
    .nullable()
    .optional()

export const matterStatusSchema = z.enum(MATTER_STATUSES, {
  errorMap: () => ({ message: 'Choose a valid status.' })
})

export const matterPrioritySchema = z.enum(MATTER_PRIORITIES, {
  errorMap: () => ({ message: 'Choose a valid priority.' })
})

export const createMatterSchema = z.object({
  title: requiredName('Title', 240),
  organisationId: z.string().uuid().nullable().optional(),
  organisationName: z
    .string()
    .transform((value) => normalizeWhitespace(value))
    .pipe(z.string().max(200, 'Organisation name is too long.'))
    .nullable()
    .optional(),
  reference: z
    .string()
    .transform((value) => normalizeWhitespace(value))
    .pipe(z.string().max(120, 'Reference is too long.'))
    .nullable()
    .optional(),
  status: matterStatusSchema.optional(),
  tagNames: z.array(z.string().transform((value) => normalizeWhitespace(value))).optional()
})

export const updateMatterSchema = z.object({
  title: requiredName('Title', 240).optional(),
  organisationId: z.string().uuid().nullable().optional(),
  reference: z
    .string()
    .transform((value) => normalizeWhitespace(value))
    .pipe(z.string().max(120, 'Reference is too long.'))
    .nullable()
    .optional(),
  status: matterStatusSchema.optional(),
  priority: matterPrioritySchema.optional(),
  description: optionalNote()
})

export const createOrganisationSchema = z.object({
  name: requiredName('Organisation name'),
  notes: optionalNote()
})

export const updateOrganisationSchema = z.object({
  name: requiredName('Organisation name').optional(),
  notes: optionalNote()
})

export const aliasSchema = z
  .string({ required_error: 'Alias is required.' })
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (normalizeAlias(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter an alias before saving.'
      })
    }
    if (value.length > 200) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 200,
        type: 'string',
        inclusive: true,
        message: 'Alias is too long.'
      })
    }
  })

export const emailSchema = z
  .string()
  .transform((value) => normalizeWhitespace(value))
  .pipe(
    z
      .string()
      .max(254, 'Email is too long.')
      .refine((value) => value.length === 0 || z.string().email().safeParse(value).success, {
        message: 'Enter a valid email address.'
      })
  )
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()

export const createContactSchema = z.object({
  name: requiredName('Name'),
  organisationId: z.string().uuid().nullable().optional(),
  jobTitle: z
    .string()
    .transform((value) => normalizeWhitespace(value))
    .pipe(z.string().max(160, 'Job title is too long.'))
    .nullable()
    .optional(),
  phone: z
    .string()
    .transform((value) => normalizeWhitespace(value))
    .pipe(z.string().max(60, 'Phone number is too long.'))
    .nullable()
    .optional(),
  email: emailSchema,
  notes: optionalNote()
})

export const updateContactSchema = createContactSchema.partial().extend({
  name: requiredName('Name').optional()
})

export const linkMatterContactSchema = z.object({
  matterId: z.string().uuid(),
  contactId: z.string().uuid(),
  role: z
    .string()
    .transform((value) => normalizeWhitespace(value))
    .pipe(z.string().max(120, 'Role is too long.'))
    .nullable()
    .optional()
})

export const tagNameSchema = requiredName('Tag name', 48)

export function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Please check the highlighted fields.'
}
