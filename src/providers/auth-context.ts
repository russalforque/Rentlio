import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Tables } from '@/lib/database.types'

export type Profile = Tables<'profiles'>

export type AuthState =
  | { status: 'loading'; session: null; profile: null }
  | { status: 'signed-out'; session: null; profile: null }
  | { status: 'signed-in'; session: Session; profile: Profile }
  /** Signed in, but the profile is missing or deactivated. */
  | { status: 'blocked'; session: Session; profile: Profile | null }
  /** Signed in, but the profile could not be loaded (e.g. offline). */
  | { status: 'error'; session: Session; profile: null; error: unknown }

export interface AuthContextValue {
  state: AuthState
  refreshProfile: () => Promise<void>
  /** Retry loading the profile after an error. */
  retry: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
