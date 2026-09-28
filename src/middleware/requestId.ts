import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.req.header('X-Request-ID')?.slice(0, 80) || crypto.randomUUID()
  c.set('requestId', id)
  c.header('X-Request-ID', id)
  await next()
}
