import type { ErrorHandler, NotFoundHandler } from 'hono'
import type { AppEnv } from '../types'
import { jsonError } from '../lib/http'

export const notFound: NotFoundHandler<AppEnv> = (c) => jsonError(c, 'Route not found.', 404)

export const onError: ErrorHandler<AppEnv> = (error, c) => {
  console.error(JSON.stringify({ message: 'request failed', requestId: c.get('requestId'), error: error.message }))
  return jsonError(c, 'An unexpected server error occurred.', 500)
}
