import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
}

export const cors: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header('Origin')
  const allowed = (c.env.CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  if (origin && allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Vary', 'Origin')
    c.header('Access-Control-Allow-Credentials', 'true')
  }
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-ID, X-Turnstile-Token')
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    return c.body(null, 204)
  }
  await next()
}
