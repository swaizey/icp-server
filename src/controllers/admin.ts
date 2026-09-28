import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { jsonError, parsePositiveInt } from '../lib/http'
import { supabaseCreateAuthUser, supabaseDeleteAuthUser, supabaseRequest, supabaseUpdateAuthUser } from '../lib/supabase'
import { putImage, deleteImage } from '../lib/storage'
import { adminUserSchema, adminUserUpdateSchema, eventSchema, massSchema, memberSchema, parseJsonField, roleSchema } from '../lib/validation'

function memberRow(data: Record<string, unknown>, image?: { key: string; url?: string }) {
  return {
    first_name: data.firstName, middle_name: data.middleName, surname: data.surname, member_type: data.memberType,
    gender: data.gender, family_name: data.familyName, mother_name: data.motherName, father_name: data.fatherName,
    house_address: data.houseAddress, email: data.email, phone: data.phone, occupation: data.occupation,
    group_name: data.group === undefined ? undefined : data.group, status: data.status,
    image_key: image ? image.key : undefined, image_url: image ? image.url : undefined,
  }
}

export async function currentUser(c: Context<AppEnv>) {
  const user = c.get('authUser')
  return c.json({ displayName: user.displayName, role: user.role })
}

export async function image(c: Context<AppEnv>) {
  const key = c.req.param('*')
  if (!key || key.includes('..') || key.length > 512) return jsonError(c, 'Image not found.', 404)

  const object = await c.env.PARISH_IMAGES.get(key)
  if (!object) return jsonError(c, 'Image not found.', 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  if (object.httpEtag) headers.set('ETag', object.httpEtag)
  return new Response(object.body, { headers })
}

export async function dashboard(c: Context<AppEnv>) {
  const data = await supabaseRequest(c.env, { table: 'dashboard_overview', select: '*' , single: true })
  return c.json(data)
}

export async function listMembers(c: Context<AppEnv>) {
  const url = new URL(c.req.url)
  const query = url.searchParams.get('q')?.trim().slice(0, 80)
  const status = url.searchParams.get('status')
  const ministry = url.searchParams.get('ministry')
  const page = parsePositiveInt(url.searchParams.get('page') ?? undefined, 1, 10000)
  const limit = parsePositiveInt(url.searchParams.get('limit') ?? undefined, 25, 100)
  const filters: Record<string, string> = {}
  if (status && status !== 'all') filters.status = status
  if (ministry && ministry !== 'all') filters.group_name = ministry
  const rows = await supabaseRequest(c.env, { table: 'members', select: 'id,member_id,first_name,middle_name,surname,member_type,gender,phone,email,family_name,group_name,status,image_key,joined_at', filters, order: 'joined_at.desc', limit, offset: (page - 1) * limit })
  const filtered = query ? (rows as Record<string, unknown>[]).filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())) : rows
  return c.json({ data: filtered, page, limit })
}

export async function getMember(c: Context<AppEnv>) {
  const id = c.req.param('id')
  if (!id) return jsonError(c, 'Member not found.', 404)
  const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'members', select: '*,member_sacraments(sacrament_id)', filters: { id } })
  const row = rows[0]
  if (!row) return jsonError(c, 'Member not found.', 404)
  return c.json(row)
}

export async function createMember(c: Context<AppEnv>) {
  const form = await c.req.raw.formData()
  const image = form.get('image')
  const optional = (name: string) => form.get(name) || undefined
  const parsed = memberSchema.safeParse({
    firstName: form.get('firstName'), middleName: optional('middleName'), surname: form.get('surname'), gender: form.get('gender'), group: form.get('group') || undefined,
    sacramentReceived: parseJsonField(form.get('sacramentReceived'), []), familyName: form.get('familyName'), motherName: optional('motherName'), fatherName: optional('fatherName'), houseAddress: form.get('houseAddress'), email: form.get('email'), phone: form.get('phone'), occupation: optional('occupation'), memberType: form.get('memberType') || undefined, status: form.get('status') || undefined,
  })
  if (!parsed.success) return jsonError(c, 'Invalid member data.', 422)

  const isFileLike = (value: unknown): value is File => {
    if (value instanceof File) return true
    return typeof value === 'object' && value !== null && 'name' in value && 'size' in value && 'type' in value
  }

  const normalizedImage = typeof image === 'string' && image.trim() === '' ? null : image
  if (normalizedImage != null && typeof normalizedImage === 'string') return jsonError(c, 'Invalid image upload.', 415)
  if (normalizedImage != null && !isFileLike(normalizedImage)) return jsonError(c, 'Invalid image upload.', 415)

  let uploaded: Awaited<ReturnType<typeof putImage>> | undefined
  try {
    if (isFileLike(normalizedImage) && normalizedImage.size > 0) uploaded = await putImage(c.env, normalizedImage, 'member-photos')
    const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'members', method: 'POST', body: memberRow(parsed.data, uploaded) })
    return c.json(rows[0], 201)
  } catch (error) {
    if (uploaded) await deleteImage(c.env, uploaded.key)
    throw error
  }
}

export async function updateMember(c: Context<AppEnv>) {
  const id = c.req.param('id')
  if (!id) return jsonError(c, 'Member not found.', 404)
  const body = await c.req.json<Record<string, unknown>>()
  const parsed = memberSchema.partial().safeParse(body)
  if (!parsed.success) return jsonError(c, 'Invalid member data.', 422)
  const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'members', method: 'PATCH', filters: { id }, body: memberRow(parsed.data) })
  return c.json(rows?.[0] ?? null)
}

export async function deleteMember(c: Context<AppEnv>) {
  const id = c.req.param('id')
  if (!id) return jsonError(c, 'Member not found.', 404)
  await supabaseRequest(c.env, { table: 'members', method: 'DELETE', filters: { id } })
  return c.body(null, 204)
}

export async function listRegistrations(c: Context<AppEnv>) {
  const registrations = await supabaseRequest<Record<string, unknown>[]>(c.env, {
    table: 'registration_requests',
    select: '*',
    filters: { status: 'pending' },
    order: 'created_at.desc',
    limit: 100,
  })
  return c.json({ data: registrations })
}

export async function approveRegistration(c: Context<AppEnv>) {
  const id = c.req.param('id')
  if (!id) return jsonError(c, 'Registration not found.', 404)

  const registrations = await supabaseRequest<Record<string, unknown>[]>(c.env, {
    table: 'registration_requests',
    select: '*',
    filters: { id },
    limit: 1,
  })
  const registration = registrations[0]
  if (!registration) return jsonError(c, 'Registration not found.', 404)

  const memberBody = {
    first_name: registration.first_name,
    middle_name: registration.middle_name ?? '',
    surname: registration.surname,
    member_type: 'Adult',
    gender: registration.gender,
    family_name: registration.family_name,
    family_id: registration.family_id ?? null,
    mother_name: registration.mother_name ?? '',
    father_name: registration.father_name ?? '',
    house_address: registration.house_address,
    email: registration.email,
    phone: registration.phone,
    occupation: registration.occupation ?? '',
    group_name: registration.group_name ?? null,
    status: 'Active',
    image_key: registration.image_key ?? null,
    image_url: registration.image_url ?? null,
  }

  try {
    const memberRows = await supabaseRequest<Record<string, unknown>[]>(c.env, {
      table: 'members',
      method: 'POST',
      select: '*',
      body: memberBody,
    })

    const memberRecord = Array.isArray(memberRows) ? memberRows[0] : memberRows
    if (!memberRecord || typeof memberRecord !== 'object' || !('id' in memberRecord)) {
      return jsonError(c, 'Approval failed: member record was not created.', 500)
    }

    const sacramentIds = Array.isArray(registration.sacrament_received) ? registration.sacrament_received.filter((value): value is string => typeof value === 'string') : []
    if (sacramentIds.length) {
      await Promise.all(sacramentIds.map((sacramentId) => supabaseRequest(c.env, {
        table: 'member_sacraments',
        method: 'POST',
        body: { member_id: memberRecord.id, sacrament_id: sacramentId },
      })))
    }

    await supabaseRequest(c.env, {
      table: 'registration_requests',
      method: 'DELETE',
      filters: { id },
    })

    return c.json({ success: true, member: memberRecord })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to approve registration.'
    if (message.includes('duplicate key') || message.includes('already exists')) {
      return jsonError(c, 'This member is already registered.', 409)
    }
    throw error
  }
}

export async function setRegistrationPending(c: Context<AppEnv>) {
  const id = c.req.param('id')
  if (!id) return jsonError(c, 'Registration not found.', 404)
  const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, {
    table: 'registration_requests',
    method: 'PATCH',
    filters: { id },
    body: { status: 'pending' },
  })
  return c.json(rows?.[0] ?? null)
}

export async function deleteRegistration(c: Context<AppEnv>) {
  const id = c.req.param('id')
  if (!id) return jsonError(c, 'Registration not found.', 404)
  await supabaseRequest(c.env, { table: 'registration_requests', method: 'DELETE', filters: { id } })
  return c.body(null, 204)
}

export async function listSchedule(c: Context<AppEnv>) {
  const [masses, events] = await Promise.all([
    supabaseRequest(c.env, { table: 'masses', select: '*', filters: { is_cancelled: false }, order: 'starts_at.asc', limit: 100 }),
    supabaseRequest(c.env, { table: 'parish_events', select: '*', filters: { is_cancelled: false }, order: 'starts_at.asc', limit: 100 }),
  ])
  return c.json({ masses, events })
}

export async function listGroups(c: Context<AppEnv>) {
  const groups = await supabaseRequest(c.env, { table: 'groups', select: 'id,name,subgroup,description,leader_name,is_active,created_at', order: 'name.asc', limit: 100 })
  return c.json(groups)
}

export async function createGroup(c: Context<AppEnv>) {
  const body = await c.req.json<{ name?: string; subgroup?: string; description?: string; leaderName?: string }>()
  const name = body.name?.trim().slice(0, 80)
  if (!name) return jsonError(c, 'Group name is required.', 422)
  const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, {
    table: 'groups', method: 'POST',
    body: { name, subgroup: body.subgroup?.trim().slice(0, 80) ?? '', description: body.description?.trim().slice(0, 240) ?? '', leader_name: body.leaderName?.trim().slice(0, 120) ?? '', created_by: c.get('authUser').appUserId },
  })
  return c.json(rows[0], 201)
}

export async function createMass(c: Context<AppEnv>) {
  const parsed = massSchema.safeParse(await c.req.json())
  if (!parsed.success) return jsonError(c, 'Invalid mass schedule data.', 422)
  const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'masses', method: 'POST', body: { starts_at: parsed.data.startsAt, title: parsed.data.title, description: parsed.data.description, location: parsed.data.location, is_recurring: parsed.data.isRecurring, created_by: c.get('authUser').appUserId } })
  return c.json(rows[0], 201)
}

export async function deleteMass(c: Context<AppEnv>) {
  const id = c.req.param('id')
  if (!id) return jsonError(c, 'Mass not found.', 404)
  await supabaseRequest(c.env, { table: 'masses', method: 'DELETE', filters: { id } })
  return c.body(null, 204)
}

export async function createEvent(c: Context<AppEnv>) {
  const parsed = eventSchema.safeParse(await c.req.json())
  if (!parsed.success) return jsonError(c, 'Invalid event data.', 422)
  const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'parish_events', method: 'POST', body: { title: parsed.data.title, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, location: parsed.data.location, tag: parsed.data.tag, description: parsed.data.description, created_by: c.get('authUser').appUserId } })
  return c.json(rows[0], 201)
}

export async function sacraments(c: Context<AppEnv>) {
  const [summary, breakdown, groups, ministers] = await Promise.all([
    supabaseRequest(c.env, { table: 'sacrament_summary', select: '*' }),
    supabaseRequest(c.env, { table: 'sacrament_breakdown', select: '*' }),
    supabaseRequest(c.env, { table: 'group_summary', select: '*', order: 'member_count.desc' }),
    supabaseRequest(c.env, { table: 'minister_summary', select: '*', order: 'count.desc' }),
  ])
  return c.json({ summary, breakdown, groups, ministers })
}

export async function reports(c: Context<AppEnv>) {
  const [summary, trend, recent] = await Promise.all([
    supabaseRequest(c.env, { table: 'report_summary', select: '*', single: true }),
    supabaseRequest(c.env, { table: 'membership_trend', select: '*', order: 'month.asc' }),
    supabaseRequest(c.env, { table: 'generated_reports', select: '*', order: 'created_at.desc', limit: 25 }),
  ])
  return c.json({ summary, trend, recent })
}

export async function roles(c: Context<AppEnv>) {
  const [roleRows, userRows] = await Promise.all([
    supabaseRequest(c.env, { table: 'roles', select: 'name,description,role_permissions(permission_key)', order: 'name.asc' }),
    supabaseRequest(c.env, { table: 'app_users', select: 'id,display_name,email,role,is_active,last_login_at', order: 'display_name.asc' }),
  ])
  return c.json({ roles: roleRows, users: userRows })
}

export async function createRole(c: Context<AppEnv>) {
  const parsed = roleSchema.safeParse(await c.req.json())
  if (!parsed.success) return jsonError(c, 'Invalid role data.', 422)
  const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'roles', method: 'POST', body: { name: parsed.data.name, description: parsed.data.description } })
  await supabaseRequest(c.env, { table: 'role_permissions', method: 'POST', body: parsed.data.permissions.map((permission_key) => ({ role: parsed.data.name, permission_key })) })
  return c.json(rows[0], 201)
}

export async function createAdminUser(c: Context<AppEnv>) {
  const parsed = adminUserSchema.safeParse(await c.req.json())
  if (!parsed.success) return jsonError(c, 'Name, email, password, and role are required. Password must be at least 8 characters.', 422)

  const role = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'roles', select: 'name', filters: { name: parsed.data.role }, limit: 1 })
  if (!role[0]) return jsonError(c, 'Selected role does not exist.', 422)

  const authUser = await supabaseCreateAuthUser(c.env, parsed.data.email, parsed.data.password, parsed.data.displayName)
  try {
    const rows = await supabaseRequest<Record<string, unknown>[]>(c.env, {
      table: 'app_users', method: 'POST',
      body: { auth_user_id: authUser.id, display_name: parsed.data.displayName, email: parsed.data.email, role: parsed.data.role, is_active: true },
    })
    return c.json(rows[0], 201)
  } catch (error) {
    await supabaseDeleteAuthUser(c.env, authUser.id)
    throw error
  }
}

export async function updateAdminUser(c: Context<AppEnv>) {
  const id = c.req.param('id')
  const parsed = adminUserUpdateSchema.safeParse(await c.req.json().catch(() => null))
  if (!id || !parsed.success) return jsonError(c, 'Invalid user data.', 422)

  const rows = await supabaseRequest<{ id: string; auth_user_id: string }[]>(c.env, { table: 'app_users', select: 'id,auth_user_id', filters: { id }, limit: 1 })
  const appUser = rows[0]
  if (!appUser) return jsonError(c, 'User not found.', 404)

  const role = await supabaseRequest<Record<string, unknown>[]>(c.env, { table: 'roles', select: 'name', filters: { name: parsed.data.role }, limit: 1 })
  if (!role[0]) return jsonError(c, 'Selected role does not exist.', 422)

  await supabaseUpdateAuthUser(c.env, appUser.auth_user_id, { email: parsed.data.email, display_name: parsed.data.displayName })
  const updated = await supabaseRequest<Record<string, unknown>[]>(c.env, {
    table: 'app_users', method: 'PATCH', filters: { id },
    body: { display_name: parsed.data.displayName, email: parsed.data.email, role: parsed.data.role, is_active: parsed.data.isActive },
  })
  return c.json(updated[0] ?? null)
}

export async function deleteAdminUser(c: Context<AppEnv>) {
  const id = c.req.param('id')
  if (!id) return jsonError(c, 'User not found.', 404)
  const rows = await supabaseRequest<{ id: string; auth_user_id: string }[]>(c.env, { table: 'app_users', select: 'id,auth_user_id', filters: { id }, limit: 1 })
  const appUser = rows[0]
  if (!appUser) return jsonError(c, 'User not found.', 404)
  if (appUser.id === c.get('authUser').appUserId) return jsonError(c, 'You cannot delete your own account.', 409)

  await supabaseDeleteAuthUser(c.env, appUser.auth_user_id)
  await supabaseRequest(c.env, { table: 'app_users', method: 'DELETE', filters: { id } })
  return c.body(null, 204)
}
