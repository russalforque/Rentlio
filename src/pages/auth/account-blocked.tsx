import { ShieldOff } from 'lucide-react'
import { StatusScreen } from '@/components/app/status-screen'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

export function AccountBlocked() {
  const { signOut } = useAuth()
  return (
    <StatusScreen
      icon={ShieldOff}
      title="Account not active"
      actions={
        <Button variant="outline" size="lg" onClick={signOut}>
          Sign out
        </Button>
      }
    >
      This account has been deactivated or is not set up yet. Please contact your landlord if you think this is a
      mistake.
    </StatusScreen>
  )
}
