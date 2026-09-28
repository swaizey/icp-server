import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { jsonError } from '../lib/http'

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('authUser')
  if (user.role !== 'Administrator') return jsonError(c, 'Administrator access required.', 403)

  await next()
}