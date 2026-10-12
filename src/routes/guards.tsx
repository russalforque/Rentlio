import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageSpinner } from '@/components/app/full-page-spinner'
import { ErrorState } from '@/components/app/states'
import { useAuth } from '@/hooks/use-auth'
import type { Enums } from '@/lib/database.types'
import { AccountBlocked } from '@/pages/auth/account-blocked'
import { HOME_BY_ROLE } from './home'

function ProfileLoadError() {
  const { state, retry } = useAuth()
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md">
        <ErrorState error={state.status === 'error' ? state.error : null} onRetry={retry} />
      </div>
    </div>
  )
}

/** Renders child routes only for a signed-in, active user (optionally of one role). */
export function RequireRole({ role }: { role?: Enums<'user_role'> }) {
  const { state } = useAuth()
  const location = useLocation()

  switch (state.status) {
    case 'loading':
      return <FullPageSpinner />
    case 'signed-out':
      return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    case 'error':
      return <ProfileLoadError />
    case 'blocked':
      return <AccountBlocked />
    case 'signed-in':
      if (role && state.profile.role !== role) return <Navigate to={HOME_BY_ROLE[state.profile.role]} replace />
      return <Outlet />
  }
}

/** Login and password-reset request pages: bounce signed-in users to their home. */
export function GuestOnly() {
  const { state } = useAuth()
  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'signed-in') return <Navigate to={HOME_BY_ROLE[state.profile.role]} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { state } = useAuth()
  switch (state.status) {
    case 'loading':
      return <FullPageSpinner />
    case 'signed-out':
      return <Navigate to="/login" replace />
    case 'error':
      return <ProfileLoadError />
    case 'blocked':
      return <AccountBlocked />
    case 'signed-in':
      return <Navigate to={HOME_BY_ROLE[state.profile.role]} replace />
  }
}
