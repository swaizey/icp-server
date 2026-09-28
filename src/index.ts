import { Hono } from 'hono'
import type { AppEnv } from './types'
import { requestId } from './middleware/requestId'
import { cors, securityHeaders } from './middleware/security'
import { notFound, onError } from './middleware/errors'
import { rateLimit } from './middleware/rateLimit'
import { publicRoutes } from './routes/public'
import { authRoutes } from './routes/auth'
import { adminRoutes } from './routes/admin'

const app = new Hono<AppEnv>()
app.use('*', requestId)
app.use('*', cors)
app.use('*', securityHeaders)
app.get('/api/health', (c) => c.json({ ok: true, service: 'icp-parish-api', timestamp: new Date().toISOString() }))
app.route('/api', publicRoutes)
app.route('/api/auth', authRoutes)
app.use('/api/admin/*', rateLimit(120, 60_000))
app.route('/api/admin', adminRoutes)
app.notFound(notFound)
app.onError(onError)

export default app
