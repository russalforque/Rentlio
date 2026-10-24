import { AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/app/full-page-spinner'
import { StatusScreen } from '@/components/app/status-screen'
import { Button } from '@/components/ui/button'
import { nextAuthStep, parseAuthLink } from '@/lib/auth-links'
import { getErrorMessage } from '@/lib/errors'
import { initialUrlHash, supabase } from '@/lib/supabase'

/**
 * Landing page for links in Supabase auth emails (invitations, password resets).
 * Works with both the default Supabase emails and the custom templates in
 * supabase/templates, then routes to the next step.
 */
export function AuthConfirmPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [link] = useState(() => parseAuthLink(params.toString(), initialUrlHash))
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // Tokens are single-use; guard against StrictMode's double effect run.
    if (!link.ok || started.current) return
    started.current = true

    const verify = async () => {
      try {
        // getSession waits for URL tokens to be consumed by the auth client.
        const { data, error } = link.kind === 'session'
          ? await supabase.auth.getSession()
          : await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
        if (error) throw error
        if (!data.session) throw new Error("We couldn't start a sign-in session from this link. Please request a new link.")
        navigate(nextAuthStep(link.type), { replace: true })
      } catch (error) {
        setVerifyError(getErrorMessage(error))
      }
    }
    void verify()
  }, [link, navigate])

  const error = link.ok ? verifyError : link.error
  if (!error) return <FullPageSpinner label="Verifying your link" />

  return (
    <StatusScreen
      icon={AlertCircle}
      tone="destructive"
      title="This link can't be used"
      actions={
        <>
          <Button asChild size="lg">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </>
      }
    >
      <p className="font-medium text-foreground">{error}</p>
      <p className="mt-2">
        For a password reset, request a new link below. For an invitation, ask your landlord to resend it.
      </p>
    </StatusScreen>
  )
}
