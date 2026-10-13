import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { HttpError } from './http.ts'

export function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

export interface CallerContext {
  user: User
  /** Acts as the caller: database functions and RLS apply. */
  userClient: SupabaseClient
  /** Service role: only for calls that have no user-level equivalent. */
  admin: SupabaseClient
}

/** Service-role client for work no user may do themselves (Auth admin, provider confirmations). */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Verifies the bearer token. Database calls through userClient run as the
 * caller, so RLS and each function's own role checks apply.
 * JWT verification is done here (verify_jwt = false in config.toml) so it works
 * with both legacy and asymmetric signing keys.
 */
export async function requireUser(req: Request): Promise<CallerContext> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) throw new HttpError(401, 'You are not signed in')
  const token = authHeader.slice('Bearer '.length)

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await userClient.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  return { user: data.user, userClient, admin: adminClient() }
}

/** Verifies the bearer token and that the caller is the active landlord. */
export async function requireLandlord(req: Request): Promise<CallerContext> {
  const ctx = await requireUser(req)
  const { data: isLandlord, error: roleError } = await ctx.userClient.rpc('is_landlord')
  if (roleError) throw roleError
  if (!isLandlord) throw new HttpError(403, 'Only the landlord can manage tenants')
  return ctx
}

/** Database functions raise readable messages; surface those, hide everything else. */
export function dbError(err: { code?: string; message: string }): HttpError {
  if (err.code === '22023' || err.code === 'P0002' || err.code === '23505' || err.code === '42501') {
    return new HttpError(err.code === '42501' ? 403 : 400, err.message)
  }
  console.error(err)
  return new HttpError(500, 'A database error occurred. Please try again.')
}
