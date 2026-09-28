import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAuth, requirePermission } from '../middleware/auth'
import { requireAdmin } from '../middleware/admin'
import { rateLimit } from '../middleware/rateLimit'
import * as admin from '../controllers/admin'

export const adminRoutes = new Hono<AppEnv>()
adminRoutes.use('*', requireAuth, requireAdmin)
adminRoutes.get('/me', admin.currentUser)
adminRoutes.get('/images/*', requirePermission('members.read'), admin.image)
adminRoutes.get('/dashboard', requirePermission('dashboard.read'), admin.dashboard)
adminRoutes.get('/members', requirePermission('members.read'), admin.listMembers)
adminRoutes.get('/members/:id', requirePermission('members.read'), admin.getMember)
adminRoutes.post('/members', requirePermission('members.write'), rateLimit(30, 60_000), admin.createMember)
adminRoutes.patch('/members/:id', requirePermission('members.write'), admin.updateMember)
adminRoutes.delete('/members/:id', requirePermission('members.delete'), admin.deleteMember)
adminRoutes.get('/registrations', requirePermission('members.read'), admin.listRegistrations)
adminRoutes.patch('/registrations/:id/approve', requirePermission('members.write'), admin.approveRegistration)
adminRoutes.patch('/registrations/:id/pending', requirePermission('members.write'), admin.setRegistrationPending)
adminRoutes.delete('/registrations/:id', requirePermission('members.delete'), admin.deleteRegistration)
adminRoutes.get('/schedule', requirePermission('schedule.read'), admin.listSchedule)
adminRoutes.post('/schedule/masses', requirePermission('schedule.write'), admin.createMass)
adminRoutes.delete('/schedule/masses/:id', requirePermission('schedule.write'), admin.deleteMass)
adminRoutes.post('/schedule/events', requirePermission('events.write'), admin.createEvent)
adminRoutes.get('/groups', requirePermission('groups.read'), admin.listGroups)
adminRoutes.post('/groups', requirePermission('groups.write'), admin.createGroup)
adminRoutes.get('/sacraments', requirePermission('sacraments.read'), admin.sacraments)
adminRoutes.get('/reports', requirePermission('reports.read'), admin.reports)
adminRoutes.get('/roles', requirePermission('users.read'), admin.roles)
adminRoutes.post('/roles', requirePermission('users.write'), admin.createRole)
adminRoutes.post('/users', requirePermission('users.write'), admin.createAdminUser)
adminRoutes.patch('/users/:id', requirePermission('users.write'), admin.updateAdminUser)
adminRoutes.delete('/users/:id', requirePermission('users.write'), admin.deleteAdminUser)
