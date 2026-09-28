import type { Context } from 'hono'
import { z } from 'zod'
import { jsonError } from '../lib/http'
import { supabaseRequest } from '../lib/supabase'
import type { AppEnv, RoleName } from '../types'

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
})

const invalidCredentials = 'Invalid email or password.'

type PasswordSignInResult = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user?: { id?: string }
}

export async function signIn(c: Context<AppEnv>) {
  const body = await c.req.json().catch(() => null)
  const parsed = signInSchema.safeParse(body)
  if (!parsed.success) return jsonError(c, invalidCredentials, 401)

  const response = await fetch(c.env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed.data),
  })
  const result = await response.json<PasswordSignInResult>().catch((): PasswordSignInResult => ({}))

  if (!response.ok || !result.access_token || !result.user?.id) {
    return jsonError(c, invalidCredentials, 401)
  }

  const appUsers = await supabaseRequest<{ id: string; role: RoleName; is_active: boolean }[]>(c.env, {
    table: 'app_users',
    select: 'id,role,is_active',
    filters: { auth_user_id: result.user.id },
    limit: 1,
  })
  const appUser = appUsers[0]
  if (!appUser?.is_active) return jsonError(c, invalidCredentials, 401)

  // Do not make a successful login fail solely because audit metadata is unavailable.
  await supabaseRequest(c.env, {
    table: 'app_users',
    method: 'PATCH',
    filters: { id: appUser.id },
    body: { last_login_at: new Date().toISOString() },
  }).catch(() => undefined)

  return c.json({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_in: result.expires_in,
    token_type: result.token_type,
  })
}

export async function signOut(c: Context<AppEnv>) {
  const authorization = c.req.header('Authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''

  if (token) {
    await fetch(c.env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/logout?scope=global', {
      method: 'POST',
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => undefined)
  }

  return c.json({ ok: true })
}
