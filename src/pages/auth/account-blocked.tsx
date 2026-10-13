import { Ban, Clock, Loader2, RefreshCw, ShieldOff, UserX } from 'lucide-react'
import { useState } from 'react'
import { StatusScreen } from '@/components/app/status-screen'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { formatDate } from '@/lib/format'

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-foreground">{value}</dd>
    </div>
  )
}

/**
 * Shown to a signed-in user who may not use the app: registration awaiting
 * approval or rejected, portal suspended, or account deactivated. The database
 * returns no rental data to these users; this screen only explains why.
 */
export function AccountBlocked() {
  const { state, signOut, refreshProfile } = useAuth()
  const [checking, setChecking] = useState(false)
  if (state.status !== 'blocked') return null
  const { reason, registration, profile } = state

  const signOutButton = (
    <Button variant="outline" size="lg" onClick={signOut}>
      Sign out
    </Button>
  )

  if (reason === 'pending' && registration) {
    const checkAgain = async () => {
      setChecking(true)
      try {
        await refreshProfile()
      } finally {
        setChecking(false)
      }
    }
    return (
      <StatusScreen
        icon={Clock}
        title="Waiting for approval"
        actions={
          <>
            <Button size="lg" onClick={checkAgain} disabled={checking}>
              {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Check again
            </Button>
            {signOutButton}
          </>
        }
      >
        <p>
          Your landlord needs to confirm who you are before you can see your room, bills and payments. They may ask you
          to show an ID or confirm your details in person.
        </p>
        <dl className="surface mt-6 divide-y px-4 text-left text-sm">
          <Detail label="Name" value={registration.full_name || '—'} />
          <Detail label="Email" value={registration.email} />
          <Detail label="Requested room" value={registration.requested_room ?? '—'} />
          <Detail label="Submitted" value={formatDate(registration.submitted_at.slice(0, 10))} />
        </dl>
      </StatusScreen>
    )
  }

  if (reason === 'rejected' && registration) {
    return (
      <StatusScreen icon={UserX} tone="destructive" title="Registration not approved" actions={signOutButton}>
        <p>Your landlord did not approve this registration.</p>
        {registration.rejection_reason && (
          <p className="surface mt-5 px-4 py-3 text-left text-sm text-foreground">“{registration.rejection_reason}”</p>
        )}
        <p className="mt-5">If you think this is a mistake, contact your landlord directly.</p>
      </StatusScreen>
    )
  }

  if (reason === 'suspended') {
    return (
      <StatusScreen icon={Ban} tone="destructive" title="Portal access suspended" actions={signOutButton}>
        <p>
          Your landlord has paused your access to the tenant portal. Your tenancy and records are not affected. Contact
          your landlord to restore access.
        </p>
        {profile?.suspension_reason && (
          <p className="surface mt-5 px-4 py-3 text-left text-sm text-foreground">“{profile.suspension_reason}”</p>
        )}
      </StatusScreen>
    )
  }

  return (
    <StatusScreen icon={ShieldOff} title="Account not active" actions={signOutButton}>
      This account has been deactivated or is not set up yet. Please contact your landlord if you think this is a
      mistake.
    </StatusScreen>
  )
}
