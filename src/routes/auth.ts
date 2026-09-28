import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { signInRateLimit } from '../middleware/rateLimit'
import { signIn, signOut } from '../controllers/auth'

export const authRoutes = new Hono<AppEnv>()
authRoutes.post('/admin/sign-in', signInRateLimit(), signIn)
authRoutes.post('/sign-out', signOut)
