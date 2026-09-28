import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv } from '../types'
import { rateLimit } from '../middleware/rateLimit'
import { createRegistration, searchFamilies } from '../controllers/registration'
import { listSchedule } from '../controllers/admin'

export const publicRoutes = new Hono<AppEnv>()
publicRoutes.post('/register', bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: 'Registration request is too large.' }, 413) }), rateLimit(5, 15 * 60 * 1000), createRegistration)
publicRoutes.get('/families/search', rateLimit(30, 60 * 1000), searchFamilies)
publicRoutes.get('/schedule', rateLimit(60, 60 * 1000), listSchedule)
