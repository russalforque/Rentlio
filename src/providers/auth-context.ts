import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Database, Tables } from '@/lib/database.types'

export type Profile = Tables<'profiles'>

/** The signed-in login's own registration request, when it has no tenant record yet. */
export type Registration = Database['public']['Functions']['my_registration']['Returns'][number]

/**
 * Why a signed-in user cannot use the app. The database enforces every one of
 * these (RLS returns nothing); this only decides which screen to show.
 */
export type BlockedReason = 'pending' | 'rejected' | 'suspended' | 'inactive' | 'unknown'

export type AuthState =
  | { status: 'loading'; session: null; profile: null }
  | { status: 'signed-out'; session: null; profile: null }
  | { status: 'signed-in'; session: Session; profile: Profile }
  /** Signed in, but awaiting approval, rejected, suspended or deactivated. */
  | { status: 'blocked'; session: Session; profile: Profile | null; reason: BlockedReason; registration: Registration | null }
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
