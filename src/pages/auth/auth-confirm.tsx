import type { EmailOtpType } from '@supabase/supabase-js'
import { AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/app/full-page-spinner'
import { StatusScreen } from '@/components/app/status-screen'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import { initialUrlHash, supabase } from '@/lib/supabase'

const SUPPORTED: EmailOtpType[] = ['invite', 'recovery', 'email_change', 'email', 'signup', 'magiclink']

type ParsedLink =
  /** Custom template link: ?token_hash=…&type=… — exchanged here. */
  | { ok: true; kind: 'token_hash'; tokenHash: string; type: EmailOtpType }
  /** Default Supabase email: #access_token=…&type=… — already exchanged by the client. */
  | { ok: true; kind: 'session'; type: string }
  | { ok: false; error: string }

function parseLink(params: URLSearchParams): ParsedLink {
  // Supabase reports problems such as an expired link in the query or hash.
  const hashParams = new URLSearchParams(initialUrlHash.slice(1))
  const urlError = params.get('error_description') ?? hashParams.get('error_description')
  if (urlError) return { ok: false, error: urlError.replace(/\+/g, ' ') }

  if (hashParams.get('access_token')) {
    return { ok: true, kind: 'session', type: hashParams.get('type') ?? '' }
  }

  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  if (tokenHash && type && SUPPORTED.includes(type)) return { ok: true, kind: 'token_hash', tokenHash, type }

  return { ok: false, error: 'This link is incomplete. Please use the most recent email you received.' }
}

function nextStep(type: string): string {
  if (type === 'invite') return '/set-password?mode=invite'
  if (type === 'recovery') return '/set-password?mode=recovery'
  return '/'
}

/**
 * Landing page for links in Supabase auth emails (invitations, password resets).
 * Works with both the default Supabase emails and the custom templates in
 * supabase/templates, then routes to the next step.
 */
export function AuthConfirmPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [link] = useState(() => parseLink(params))
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // Tokens are single-use; guard against StrictMode's double effect run.
    if (!link.ok || started.current) return
    started.current = true

    if (link.kind === 'session') {
      // getSession waits for the client to finish reading the tokens from the URL.
      supabase.auth.getSession().then(({ data, error }) => {
        if (error || !data.session) {
          setVerifyError(error ? getErrorMessage(error) : 'This link has expired or was already used.')
          return
        }
        navigate(nextStep(link.type), { replace: true })
      })
      return
    }

    supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type }).then(({ error }) => {
      if (error) {
        setVerifyError(getErrorMessage(error))
        return
      }
      navigate(nextStep(link.type), { replace: true })
    })
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
        Links work once and expire after a while. Ask your landlord to resend your invitation, or request a new password
        reset link.
      </p>
    </StatusScreen>
  )
}
