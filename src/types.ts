export type RoleName = 'Administrator' | 'Manager' | 'Staff'

export type RuntimeEnv = Env & {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  PUBLIC_R2_URL?: string
  CORS_ORIGINS?: string
  MAX_UPLOAD_BYTES?: string
  TURNSTILE_REQUIRED?: string
  TURNSTILE_SECRET_KEY?: string
}

export interface AuthUser {
  id: string
  email?: string
  appUserId: string
  displayName: string
  role: RoleName
  permissions: string[]
}

export interface AppEnv {
  Bindings: RuntimeEnv
  Variables: {
    authUser: AuthUser
    requestId: string
  }
}
