import { z } from 'zod'

function sanitizeText(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
}

const cleanText = (max: number) => z.string().transform(sanitizeText).pipe(z.string().min(1).max(max))
const optionalText = (max: number) => z.string().transform(sanitizeText).pipe(z.string().max(max)).optional().or(z.literal(''))
const optionalCount = z.preprocess((value) => value === '' || value === null || value === undefined ? undefined : value, z.coerce.number().int().min(0).max(1000).optional())

export const sacramentIds = ['baptism', 'first-communion', 'confirmation', 'marriage'] as const
export const groupNames = [
  'Choir',
  'Lectors',
  'Altar Servers',
  'Youth Ministry',
  'Women Fellowship',
  'Prayer Group',
  'Legion of Mary',
  'Catechism (CCD)',
  'Not sure yet',
  'CYON',
  'CMO',
  'CWO',
  'St. Vincent de Paul',
  'Sacred Heart',
  'Altar Boys',
  '7am Mass Choir (St. Cecilia Choir)',
  '9am Mass Choir (St. Gregory Choir)',
  'Legion of Mary - Presidium 1',
  'Legion of Mary - Presidium 2',
  'Legion of Mary - Presidium 3',
] as const

export const registrationSchema = z.object({
  firstName: cleanText(80),
  middleName: optionalText(80),
  surname: cleanText(80),
  gender: z.enum(['female', 'male', 'prefer-not-to-say']),
  group: z.enum(groupNames).optional(),
  sacramentReceived: z.array(z.enum(sacramentIds)).max(4).default([]),
  familyId: z.string().uuid().optional().or(z.literal('')),
  familyName: optionalText(120),
  motherName: optionalText(120),
  fatherName: optionalText(120),
  motherPhone: optionalText(40),
  fatherPhone: optionalText(40),
  familyPhone: optionalText(40),
  childrenCount: optionalCount,
  grandchildrenCount: optionalCount,
  deceasedLovedOnesCount: optionalCount,
  houseAddress: cleanText(240),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: cleanText(40),
  occupation: optionalText(120),
  website: z.string().max(0).optional(),
})

export const memberSchema = registrationSchema.omit({ website: true }).extend({
  memberType: z.enum(['Adult', 'Youth', 'Senior Citizen']).default('Adult'),
  status: z.enum(['Active', 'Inactive']).default('Active'),
})

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9 &_-]+$/),
  description: optionalText(240),
  permissions: z.array(cleanText(80)).max(50),
})

export const adminUserSchema = z.object({
  displayName: cleanText(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
  role: z.string().trim().min(1).max(60),
})

export const adminUserUpdateSchema = z.object({
  displayName: cleanText(120),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.string().trim().min(1).max(60),
  isActive: z.boolean(),
})

export const massSchema = z.object({
  startsAt: z.string().datetime(),
  title: cleanText(120),
  description: optionalText(500),
  location: cleanText(120),
  isRecurring: z.boolean().default(false),
})

export const eventSchema = z.object({
  title: cleanText(160),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  location: cleanText(120),
  tag: cleanText(60),
  description: optionalText(500),
})

export function parseJsonField(value: FormDataEntryValue | null, fallback: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
