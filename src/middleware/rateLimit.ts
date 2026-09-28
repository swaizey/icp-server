import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { jsonError } from '../lib/http'

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function clientIdentity(c: Parameters<MiddlewareHandler<AppEnv>>[0]) {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
}

function consume(c: Parameters<MiddlewareHandler<AppEnv>>[0], key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
  bucket.count += 1
  buckets.set(key, bucket)
  if (bucket.count <= limit) return null

  c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
  return jsonError(c, 'Too many requests. Please try again later.', 429)
}

export function rateLimit(limit: number, windowMs: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const blocked = consume(c, c.req.path + ':ip:' + clientIdentity(c), limit, windowMs)
    if (blocked) return blocked
    await next()
  }
}

// Password attempts are limited by both origin IP and email address. This blocks
// rapid guessing from one host and password spraying against one account.
export function signInRateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const body = await c.req.raw.clone().json<{ email?: unknown }>().catch((): { email?: unknown } => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : 'invalid'
    const ipBlocked = consume(c, c.req.path + ':ip:' + clientIdentity(c), 10, 15 * 60 * 1000)
    if (ipBlocked) return ipBlocked
    const accountBlocked = consume(c, c.req.path + ':email:' + email, 5, 15 * 60 * 1000)
    if (accountBlocked) return accountBlocked
    await next()
  }
}
