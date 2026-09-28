import type { Context } from 'hono'
import type { AppEnv } from '../types'

export function jsonError(c: Context<AppEnv>, message: string, status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500) {
  return c.json({ error: message, requestId: c.get('requestId') }, status)
}

export function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export function safeFilename(filename: string) {
  return filename.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120)
}
