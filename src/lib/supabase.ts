import type { RuntimeEnv } from '../types'

export type SupabaseRow = Record<string, unknown>

type QueryOptions = {
  table: string
  select?: string
  filters?: Record<string, string | number | boolean | null>
  order?: string
  limit?: number
  offset?: number
  or?: string
  body?: unknown
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  single?: boolean
}

function headers(env: RuntimeEnv, prefer?: string) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

export async function supabaseRequest<T>(env: RuntimeEnv, options: QueryOptions): Promise<T> {
  const url = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${options.table}`)
  if (options.select) url.searchParams.set('select', options.select)
  for (const [key, value] of Object.entries(options.filters ?? {})) {
    url.searchParams.set(key, value === null ? 'is.null' : `eq.${value}`)
  }
  if (options.order) url.searchParams.set('order', options.order)
  if (options.limit) url.searchParams.set('limit', String(options.limit))
  if (options.offset) url.searchParams.set('offset', String(options.offset))
  if (options.or) url.searchParams.set('or', options.or)

  const method = options.method ?? 'GET'
  const shouldReturnRepresentation = method === 'POST' || method === 'PATCH'
  if (shouldReturnRepresentation && !options.select) url.searchParams.set('select', '*')
  const response = await fetch(url, {
    method,
    headers: headers(env, shouldReturnRepresentation ? 'return=representation' : undefined),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Supabase ${method} ${options.table} failed: ${response.status} ${detail.slice(0, 300)}`)
  }

  if (response.status === 204) return undefined as T
  const rows = await response.json<T>()
  return options.single && Array.isArray(rows) ? rows[0] as T : rows
}

export async function supabaseAuthUser(env: RuntimeEnv, token: string) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  return response.json<{ id: string; email?: string }>()
}

export async function supabaseCreateAuthUser(env: RuntimeEnv, email: string, password: string, displayName: string) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: displayName } }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Supabase Auth user creation failed: ${response.status} ${detail.slice(0, 300)}`)
  }
  return response.json<{ id: string; email?: string }>()
}

export async function supabaseDeleteAuthUser(env: RuntimeEnv, id: string) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(env),
  })
  if (!response.ok) throw new Error(`Supabase Auth user cleanup failed: ${response.status}`)
}

export async function supabaseUpdateAuthUser(env: RuntimeEnv, id: string, data: { email?: string; display_name?: string }) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(env),
    body: JSON.stringify({ email: data.email, user_metadata: data.display_name ? { display_name: data.display_name } : undefined }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Supabase Auth user update failed: ${response.status} ${detail.slice(0, 300)}`)
  }
}
