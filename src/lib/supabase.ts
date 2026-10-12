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

const REMEMBER_KEY = 'rentlio:remember-me'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/** Whether the next sign-in should outlast the browser session. Defaults to yes. */
export function getRememberMe(): boolean {
  return safe(() => localStorage.getItem(REMEMBER_KEY) !== '0', true)
}

export function setRememberMe(remember: boolean) {
  safe(() => localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'), undefined)
}

/**
 * Session storage for the auth client: "Remember me" keeps the session in
 * localStorage; otherwise it lives in sessionStorage and ends with the browser.
 * Reads check both, so an existing session keeps working either way.
 */
const authStorage = {
  getItem: (key: string) => safe(() => localStorage.getItem(key) ?? sessionStorage.getItem(key), null),
  setItem: (key: string, value: string) =>
    safe(() => {
      const [keep, drop] = getRememberMe() ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
      keep.setItem(key, value)
      drop.removeItem(key)
    }, undefined),
  removeItem: (key: string) =>
    safe(() => {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }, undefined),
}

// When unconfigured the app renders a setup screen instead of using this client,
// so the placeholder values are never contacted.
export const supabase = createClient<Database>(url ?? 'http://localhost', key ?? 'missing', {
  auth: {
    persistSession: true,
    storage: typeof window === 'undefined' ? undefined : authStorage,
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
