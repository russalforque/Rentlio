import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && key)

/**
 * The URL fragment as the page was opened. Default Supabase auth emails return
 * the session (and the link type) in the hash, which the client below consumes
 * and clears, so /auth/confirm reads the original from here.
 */
export const initialUrlHash = typeof window === 'undefined' ? '' : window.location.hash

// When unconfigured the app renders a setup screen instead of using this client,
// so the placeholder values are never contacted.
export const supabase = createClient<Database>(url ?? 'http://localhost', key ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Invite links are created server-side by the Auth admin API, which has no
    // PKCE verifier, so email links must use the implicit (URL hash) flow.
    flowType: 'implicit',
  },
})

export const STORAGE_BUCKETS = {
  paymentProofs: 'payment-proofs',
  tenantDocuments: 'tenant-documents',
  avatars: 'avatars',
} as const
