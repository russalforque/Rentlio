import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errors'
import { createSessionHandler } from '@/lib/auth-session'
import { AuthContext, type AuthState, type BlockedReason, type Profile, type Registration } from './auth-context'

interface Account {
  profile: Profile | null
  /** Only fetched when the login has no tenant record yet. */
  registration: Registration | null
}

/** The login's record (linked by user_id), or else its registration request. */
async function fetchAccount(userId: string): Promise<Account> {
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (profile) return { profile, registration: null }
  const { data: rows, error: regError } = await supabase.rpc('my_registration')
  if (regError) throw regError
  return { profile: null, registration: rows[0] ?? null }
}

function blockedReason({ profile, registration }: Account): BlockedReason | null {
  if (profile) {
    if (!profile.is_active) return 'inactive'
    if (profile.suspended_at) return 'suspended'
    return null
  }
  if (registration?.status === 'pending') return 'pending'
  if (registration?.status === 'rejected') return 'rejected'
  return 'unknown'
}

type Loaded = { userId: string; account: Account; error: null } | { userId: string; account: null; error: unknown }

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Tagged with the user it belongs to, so a stale profile is never shown for a
  // different user while the new one loads.
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const activeUserId = useRef<string | null>(null)

  useEffect(() => {
    // Keep this callback synchronous: awaiting Supabase calls inside it can deadlock
    // the auth client. INITIAL_SESSION also provides the persisted session.
    const { data } = supabase.auth.onAuthStateChange(createSessionHandler<Session>(() => {
      // Includes expiry and sign-out/account changes from another tab. Cached
      // tenant data must never survive an identity change, even for 30 seconds.
      queryClient.clear()
      setLoaded(null)
    }, next => {
      activeUserId.current = next?.user.id ?? null
      setSession(next)
    }))
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  // Re-fetch only when the signed-in user changes (or on retry), not on token refresh.
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchAccount(userId)
      .then((account) => !cancelled && setLoaded({ userId, account, error: null }))
      .catch((error: unknown) => !cancelled && setLoaded({ userId, account: null, error }))
    return () => {
      cancelled = true
    }
  }, [userId, attempt])

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    const account = await fetchAccount(userId)
    if (activeUserId.current === userId) setLoaded({ userId, account, error: null })
  }, [userId])

  const retry = useCallback(() => {
    setLoaded(null)
    setAttempt((n) => n + 1)
  }, [])

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      queryClient.clear()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }, [queryClient])

  const state = useMemo<AuthState>(() => {
    if (session === undefined) return { status: 'loading', session: null, profile: null }
    if (session === null) return { status: 'signed-out', session: null, profile: null }
    if (!loaded || loaded.userId !== session.user.id) return { status: 'loading', session: null, profile: null }
    if (loaded.account === null) return { status: 'error', session, profile: null, error: loaded.error }
    const { account } = loaded
    const reason = blockedReason(account)
    if (reason || !account.profile) {
      return { status: 'blocked', session, profile: account.profile, reason: reason ?? 'unknown', registration: account.registration }
    }
    return { status: 'signed-in', session, profile: account.profile }
  }, [session, loaded])

  const value = useMemo(
    () => ({ state, refreshProfile, retry, signOut }),
    [state, refreshProfile, retry, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
