import { useContext } from 'react'
import { AuthContext, type Profile } from '@/providers/auth-context'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For components rendered behind <RequireRole>, where a profile is guaranteed. */
export function useProfile(): Profile {
  const { state } = useAuth()
  if (state.status !== 'signed-in') throw new Error('useProfile used outside an authenticated route')
  return state.profile
}
