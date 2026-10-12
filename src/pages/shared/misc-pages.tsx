import { Compass, Settings2 } from 'lucide-react'
import { Link } from 'react-router'
import { StatusScreen } from '@/components/app/status-screen'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <StatusScreen
      icon={Compass}
      title="Page not found"
      actions={
        <Button asChild size="lg">
          <Link to="/">Go home</Link>
        </Button>
      }
    >
      The page you are looking for does not exist or has moved.
    </StatusScreen>
  )
}

const code = 'rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground'

/** Shown when the deployment is missing its Supabase environment variables. */
export function SetupRequiredPage() {
  return (
    <StatusScreen icon={Settings2} title="Connect Supabase">
      Set <code className={code}>VITE_SUPABASE_URL</code> and <code className={code}>VITE_SUPABASE_PUBLISHABLE_KEY</code> in a{' '}
      <code className={code}>.env.local</code> file (or in your Vercel project settings), then restart the app. See{' '}
      <code className={code}>.env.example</code>.
    </StatusScreen>
  )
}
