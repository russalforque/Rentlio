import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthState, type Profile } from './auth-context'

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

type Loaded = { userId: string; profile: Profile | null; error: null } | { userId: string; profile: null; error: unknown }

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Tagged with the user it belongs to, so a stale profile is never shown for a
  // different user while the new one loads.
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    // Keep this callback synchronous: awaiting Supabase calls inside it can deadlock
    // the auth client. Profile loading happens in the effect below.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  // Re-fetch only when the signed-in user changes (or on retry), not on token refresh.
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchProfile(userId)
      .then((profile) => !cancelled && setLoaded({ userId, profile, error: null }))
      .catch((error: unknown) => !cancelled && setLoaded({ userId, profile: null, error }))
    return () => {
      cancelled = true
    }
  }, [userId, attempt])

  const refreshProfile = useCallback(async () => {
    if (userId) setLoaded({ userId, profile: await fetchProfile(userId), error: null })
  }, [userId])

  const retry = useCallback(() => {
    setLoaded(null)
    setAttempt((n) => n + 1)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.clear()
  }, [queryClient])

  const state = useMemo<AuthState>(() => {
    if (session === undefined) return { status: 'loading', session: null, profile: null }
    if (session === null) return { status: 'signed-out', session: null, profile: null }
    if (!loaded || loaded.userId !== session.user.id) return { status: 'loading', session: null, profile: null }
    if (loaded.error) return { status: 'error', session, profile: null, error: loaded.error }
    const { profile } = loaded
    if (profile === null || !profile.is_active) return { status: 'blocked', session, profile }
    return { status: 'signed-in', session, profile }
  }, [session, loaded])

  const value = useMemo(
    () => ({ state, refreshProfile, retry, signOut }),
    [state, refreshProfile, retry, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
