import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { jsonError } from '../lib/http'
import { supabaseRequest } from '../lib/supabase'
import { putImage } from '../lib/storage'
import { parseJsonField, registrationSchema } from '../lib/validation'

function normalizeDuplicateValue(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function familyIdentity(familyName: string, fatherName: string, motherName: string) {
  return [familyName, fatherName, motherName].map(normalizeDuplicateValue).join('\u001f')
}

function maskPhone(value: unknown) {
  const phone = typeof value === 'string' ? value.trim() : ''
  if (phone.length <= 6) return 'XXXXXX'
  return `${phone.slice(0, 3)}${'X'.repeat(phone.length - 6)}${phone.slice(-3)}`
}

export async function searchFamilies(c: Context<AppEnv>) {
  const query = new URL(c.req.url).searchParams.get('q')?.trim().slice(0, 80) || ''
  if (query.length < 2) return c.json({ data: [] })

  const safeQuery = query.replace(/[^a-zA-Z0-9 +()_-]/g, '')
  if (safeQuery.length < 2) return c.json({ data: [] })
  const families = await supabaseRequest<Record<string, unknown>[]>(c.env, {
    table: 'families',
    select: 'id,family_name,father_phone,mother_phone',
    or: `family_name.ilike.*${safeQuery}*,father_phone.ilike.*${safeQuery}*,mother_phone.ilike.*${safeQuery}*`,
    limit: 5,
  })

  return c.json({ data: families.map((family) => ({
    id: family.id,
    familyName: family.family_name,
    registeredNumbers: [family.father_phone, family.mother_phone].filter((value) => typeof value === 'string' && value.trim()).map(maskPhone),
  })) })
}

function similarityScore(left: string, right: string) {
  const a = normalizeDuplicateValue(left)
  const b = normalizeDuplicateValue(right)
  if (!a && !b) return 1
  if (!a || !b) return 0
  if (a === b) return 1

  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1

  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }

  return 1 - matrix[a.length][b.length] / maxLen
}

function buildComparableRecord(record: Record<string, unknown>) {
  return {
    firstName: record.first_name ?? record.firstName,
    middleName: record.middle_name ?? record.middleName ?? '',
    surname: record.surname,
    gender: record.gender,
    group: record.group_name ?? record.group ?? '',
    familyName: record.family_name ?? record.familyName,
    motherName: record.mother_name ?? record.motherName ?? '',
    fatherName: record.father_name ?? record.fatherName ?? '',
    houseAddress: record.house_address ?? record.houseAddress,
    email: record.email,
    phone: record.phone,
    occupation: record.occupation ?? '',
  }
}

function isLikelyDuplicate(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const fields = [
    'firstName', 'middleName', 'surname', 'gender', 'group', 'familyName', 'motherName', 'fatherName', 'houseAddress', 'email', 'phone', 'occupation',
  ]

  const comparableFields = fields
    .map((field) => ({ field, left: incoming[field], right: existing[field] }))
    .filter(({ left, right }) => left !== undefined && right !== undefined && String(left).trim() && String(right).trim())

  if (!comparableFields.length) return false

  let total = 0
  for (const { left, right } of comparableFields) {
    total += similarityScore(String(left), String(right))
  }

  const average = total / comparableFields.length
  const exactEmailMatch = normalizeDuplicateValue(incoming.email) && normalizeDuplicateValue(incoming.email) === normalizeDuplicateValue(existing.email)
  const exactPhoneMatch = normalizeDuplicateValue(incoming.phone) && normalizeDuplicateValue(incoming.phone) === normalizeDuplicateValue(existing.phone)

  return average >= 0.95 || exactEmailMatch || exactPhoneMatch
}

async function hasDuplicateRegistration(c: Context<AppEnv>, data: Record<string, unknown>) {
  const email = String(data.email ?? '').trim().toLowerCase()
  const phone = String(data.phone ?? '').trim()
  const [memberEmail, memberPhone, pendingEmail, pendingPhone] = await Promise.all([
    supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'members', select: 'id', filters: { email }, limit: 1 }),
    supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'members', select: 'id', filters: { phone }, limit: 1 }),
    supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'registration_requests', select: 'id', filters: { email, status: 'pending' }, limit: 1 }),
    supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'registration_requests', select: 'id', filters: { phone, status: 'pending' }, limit: 1 }),
  ])
  return Boolean(memberEmail[0] || memberPhone[0] || pendingEmail[0] || pendingPhone[0])
}

export async function createRegistration(c: Context<AppEnv>) {
  const form = await c.req.raw.formData()
  const image = form.get('image')
  const optional = (name: string) => form.get(name) || undefined
  const turnstileRequired = c.env.TURNSTILE_REQUIRED === 'true'
  if (turnstileRequired) {
    if (!c.env.TURNSTILE_SECRET_KEY) return jsonError(c, 'Bot verification is not configured on the server.', 500)
    const token = c.req.header('X-Turnstile-Token') || optional('turnstileToken')
    if (!token) return jsonError(c, 'Bot verification is required.', 403)
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: c.env.TURNSTILE_SECRET_KEY, response: token, remoteip: c.req.header('CF-Connecting-IP') }),
    })
    const result = await verification.json<{ success?: boolean }>()
    if (!verification.ok || !result.success) return jsonError(c, 'Bot verification failed.', 403)
  }
  const payload = registrationSchema.safeParse({
    firstName: form.get('firstName'), middleName: optional('middleName'), surname: form.get('surname'), familyId: optional('familyId'),
    gender: form.get('gender'), group: form.get('group') || undefined,
    sacramentReceived: parseJsonField(form.get('sacramentReceived'), []),
    familyName: optional('familyName'), motherName: optional('motherName'), fatherName: optional('fatherName'),
    motherPhone: optional('motherPhone'), fatherPhone: optional('fatherPhone'), familyPhone: optional('familyPhone'),
    childrenCount: optional('childrenCount'), grandchildrenCount: optional('grandchildrenCount'), deceasedLovedOnesCount: optional('deceasedLovedOnesCount'),
    houseAddress: form.get('houseAddress'), email: form.get('email'), phone: form.get('phone'),
    occupation: optional('occupation'), website: optional('website'),
  })
  if (!payload.success) return jsonError(c, 'Please check the registration fields and try again.', 422)
  if (payload.data.website !== undefined) return jsonError(c, 'Registration rejected.', 422)

  const familyName = payload.data.familyName || payload.data.surname

  let familyId = payload.data.familyId || undefined
  if (familyId) {
    const family = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'families', select: 'id', filters: { id: familyId }, limit: 1 })
    if (!family[0]) return jsonError(c, 'The selected family could not be found.', 422)
  }

  const duplicateCandidate = {
    firstName: payload.data.firstName,
    middleName: payload.data.middleName ?? '',
    surname: payload.data.surname,
    gender: payload.data.gender,
    group: payload.data.group ?? '',
    familyName,
    motherName: payload.data.motherName ?? '',
    fatherName: payload.data.fatherName ?? '',
    houseAddress: payload.data.houseAddress,
    email: payload.data.email,
    phone: payload.data.phone,
    occupation: payload.data.occupation ?? '',
  }

  const duplicateMatch = await hasDuplicateRegistration(c, duplicateCandidate)
  if (duplicateMatch) {
    return jsonError(c, 'This registration appears to be a duplicate of an existing member or pending application. Please contact the parish office if this is a mistake.', 409)
  }

  if (!familyId && payload.data.familyName) {
    const fatherName = payload.data.fatherName ?? ''
    const motherName = payload.data.motherName ?? ''
    const identity = familyIdentity(familyName, fatherName, motherName)
    const existing = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'families', select: 'id', filters: { family_identity: identity }, limit: 1 })
    if (existing[0]) familyId = String(existing[0].id)
    else {
      const created = await supabaseRequest<Record<string, unknown>[]>(c.env, {
        table: 'families', method: 'POST',
        body: {
          family_name: familyName,
          father_name: fatherName,
          mother_name: motherName,
          father_phone: payload.data.fatherPhone ?? payload.data.familyPhone ?? '',
          mother_phone: payload.data.motherPhone ?? '',
          children_count: payload.data.childrenCount ?? 0,
          grandchildren_count: payload.data.grandchildrenCount ?? 0,
          deceased_loved_ones_count: payload.data.deceasedLovedOnesCount ?? 0,
          family_identity: identity,
        },
      })
      familyId = String(created[0]?.id)
    }
  }

  const isFileLike = (value: unknown): value is File => {
    if (value instanceof File) return true
    return typeof value === 'object' && value !== null && 'name' in value && 'size' in value && 'type' in value
  }

  const normalizedImage = typeof image === 'string' && image.trim() === '' ? null : image
  if (normalizedImage != null && typeof normalizedImage === 'string') return jsonError(c, 'Invalid image upload.', 415)
  if (normalizedImage != null && !isFileLike(normalizedImage)) return jsonError(c, 'Invalid image upload.', 415)

  const imageUpload = isFileLike(normalizedImage) && normalizedImage.size > 0 ? normalizedImage : undefined
  let uploaded: Awaited<ReturnType<typeof putImage>> | undefined
  try {
    if (imageUpload) uploaded = await putImage(c.env, imageUpload, 'member-photos')
    const rows = await supabaseRequest<{ id: string; member_id: string }[]>(c.env, {
      table: 'registration_requests', method: 'POST',
      body: {
        first_name: payload.data.firstName, middle_name: payload.data.middleName, surname: payload.data.surname,
        gender: payload.data.gender, group_name: payload.data.group ?? null, sacrament_received: payload.data.sacramentReceived,
        family_id: familyId ?? null, family_name: familyName, mother_name: payload.data.motherName ?? '', father_name: payload.data.fatherName ?? '',
        mother_phone: payload.data.motherPhone ?? '', father_phone: payload.data.fatherPhone ?? '', family_phone: payload.data.familyPhone ?? '',
        children_count: payload.data.childrenCount ?? null, grandchildren_count: payload.data.grandchildrenCount ?? null,
        deceased_loved_ones_count: payload.data.deceasedLovedOnesCount ?? null,
        house_address: payload.data.houseAddress, email: payload.data.email, phone: payload.data.phone, occupation: payload.data.occupation,
        image_key: uploaded?.key ?? null, image_url: uploaded?.url ?? null, status: 'pending',
      },
    })
    return c.json({ message: 'Registration submitted for parish review.', request: rows[0] }, 201)
  } catch (error) {
    if (uploaded) await c.env.PARISH_IMAGES.delete(uploaded.key)
    throw error
  }
}
