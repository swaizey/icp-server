import type { MiddlewareHandler } from 'hono'
import type { AppEnv, AuthUser, RoleName } from '../types'
import { jsonError } from '../lib/http'
import { supabaseAuthUser, supabaseRequest } from '../lib/supabase'

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header('Authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return jsonError(c, 'Authentication required.', 401)

  const authUser = await supabaseAuthUser(c.env, token)
  if (!authUser) return jsonError(c, 'Invalid or expired session.', 401)

  const appUsers = await supabaseRequest<{ id: string; role: RoleName; is_active: boolean; display_name: string }[]>(c.env, {
    table: 'app_users',
    select: 'id,role,is_active,display_name',
    filters: { auth_user_id: authUser.id },
    limit: 1,
  })
  const appUser = appUsers[0]
  if (!appUser?.is_active) return jsonError(c, 'User account is inactive.', 403)

  const permissions = await supabaseRequest<{ permission_key: string }[]>(c.env, {
    table: 'role_permissions',
    select: 'permission_key',
    filters: { role: appUser.role },
  })
  const identity: AuthUser = {
    id: authUser.id,
    email: authUser.email,
    appUserId: appUser.id,
    displayName: appUser.display_name,
    role: appUser.role,
    permissions: permissions.map((item) => item.permission_key),
  }
  c.set('authUser', identity)
  await next()
}

export function requirePermission(permission: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('authUser')
    if (!user.permissions.includes(permission)) return jsonError(c, 'You do not have permission to perform this action.', 403)
    await next()
  }
}
