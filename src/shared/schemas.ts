import { z } from 'zod/v3'
import { EVENT_DIRECTIONS, EVENT_TYPES, MATTER_PRIORITIES, MATTER_STATUSES } from './types'
import { normalizeAlias, normalizeMultilineText, normalizeWhitespace } from './normalize'

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
    .transform((value) => normalizeMultilineText(value))
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

export const eventTypeSchema = z.enum(EVENT_TYPES, {
  errorMap: () => ({ message: 'Choose a valid activity type.' })
})

export const eventDirectionSchema = z.enum(EVENT_DIRECTIONS, {
  errorMap: () => ({ message: 'Choose a valid direction.' })
})

const isoDateSchema = z
  .string({ required_error: 'Date and time are required.' })
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date and time are required.' })
      return
    }
    if (Number.isNaN(Date.parse(value))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid date and time.' })
    }
  })

const optionalLongText = (max = 20000) =>
  z
    .string()
    .max(max, 'That text is too long.')
    .transform((value) => normalizeMultilineText(value))
    .nullable()
    .optional()

export const eventEmailSchema = z.object({
  fromAddress: optionalLongText(254),
  toAddresses: optionalLongText(2000),
  ccAddresses: optionalLongText(2000),
  subject: optionalLongText(500)
})

const eventFields = {
  title: optionalLongText(240),
  body: optionalLongText(),
  contactId: z.string().uuid().nullable().optional(),
  direction: eventDirectionSchema.nullable().optional(),
  occurredAt: isoDateSchema.optional(),
  email: eventEmailSchema.nullable().optional()
}

export const createEventSchema = z
  .object({
    matterId: z.string().uuid({ message: 'This activity must belong to a matter.' }),
    type: eventTypeSchema,
    ...eventFields
  })
  .superRefine((value, ctx) => applyEventRules(value, ctx))

export const updateEventSchema = z
  .object(eventFields)
  .superRefine((value, ctx) => applyEventRules({ ...value, type: undefined }, ctx, true))

function applyEventRules(
  value: {
    type?: (typeof EVENT_TYPES)[number]
    title?: string | null
    body?: string | null
    contactId?: string | null
    direction?: (typeof EVENT_DIRECTIONS)[number] | null
    email?: { subject?: string | null } | null
  },
  ctx: z.RefinementCtx,
  isUpdate = false
): void {
  const type = value.type
  if (!type && isUpdate) return

  if (type === 'note' || type === 'meeting' || type === 'whatsapp') {
    if (!value.body) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: type === 'note' ? 'Write a note before saving.' : 'Add some notes before saving.'
      })
    }
  }

  if (type === 'phone' && !value.body && !value.contactId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['body'],
      message: 'Add a note or a contact so this call is useful later.'
    })
  }

  if (type === 'email') {
    const subject = value.email?.subject ?? null
    if (!value.body && !subject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'Add a subject or paste the email body.'
      })
    }
  }

  if (type === 'letter' && !value.body && !value.title) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['body'],
      message: 'Add a title or some content for this letter.'
    })
  }

  if ((type === 'phone' || type === 'email' || type === 'whatsapp' || type === 'letter') && !isUpdate) {
    if (value.direction !== 'incoming' && value.direction !== 'outgoing') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direction'],
        message: 'Choose incoming or outgoing.'
      })
    }
  }
}

const optionalIso = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length === 0 || !Number.isNaN(Date.parse(value)), {
    message: 'Enter a valid date and time.'
  })
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()

export const createActionSchema = z.object({
  matterId: z.string().uuid(),
  title: requiredName('Title', 240),
  notes: optionalNote(),
  dueAt: optionalIso,
  priority: matterPrioritySchema.optional(),
  setAsNextAction: z.boolean().optional()
})

export const createWaitingSchema = z
  .object({
    matterId: z.string().uuid(),
    title: requiredName('What are you waiting for?', 240),
    notes: optionalNote(),
    dueAt: optionalIso,
    priority: matterPrioritySchema.optional(),
    waitingForContactId: z.string().uuid().nullable().optional(),
    waitingForText: z
      .string()
      .transform((value) => normalizeWhitespace(value))
      .pipe(z.string().max(200, 'That is too long.'))
      .nullable()
      .optional(),
    waitingSince: isoDateSchema.optional(),
    setAsNextAction: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.waitingForContactId && !value.waitingForText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['waitingForText'],
        message: 'Say who or what you are waiting for.'
      })
    }
  })

export const updateWorkItemSchema = z.object({
  title: requiredName('Title', 240).optional(),
  notes: optionalNote(),
  dueAt: optionalIso,
  priority: matterPrioritySchema.optional(),
  waitingForContactId: z.string().uuid().nullable().optional(),
  waitingForText: z
    .string()
    .transform((value) => normalizeWhitespace(value))
    .pipe(z.string().max(200, 'That is too long.'))
    .nullable()
    .optional(),
  waitingSince: isoDateSchema.optional()
})

export const documentStorageModeSchema = z.enum(['reference', 'copy'], {
  errorMap: () => ({ message: 'Choose how MatterDock should keep this file.' })
})

const requiredPath = z
  .string({ required_error: 'Choose a file.' })
  .transform((value) => value.trim())
  .pipe(z.string().min(1, 'Choose a file.').max(1000, 'That file path is too long.'))

export const attachDocumentSchema = z.object({
  matterId: z.string().uuid(),
  path: requiredPath,
  notes: optionalNote()
})

export const updateDocumentSchema = z.object({
  notes: optionalNote()
})

export const relinkDocumentSchema = z.object({
  path: requiredPath
})

export function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Please check the highlighted fields.'
}
