import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, KeyRound, Loader2, MailCheck, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthHeading } from '@/layouts/auth-layout'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const schema = z.object({ email: z.string().trim().pipe(z.email('Enter a valid email address')) })
const RESEND_DELAY_SECONDS = 60
type Values = z.infer<typeof schema>

function BackToSignIn() {
  return (
    <div className="auth-recovery-back">
      <Link to="/login" className="auth-text-link">
        <ArrowLeft className="size-3.5" aria-hidden /> Back to sign in
      </Link>
    </div>
  )
}

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [resendStatus, setResendStatus] = useState('')
  const confirmationRef = useRef<HTMLElement>(null)
  // Prevent a second request before React renders the disabled state.
  const requestPending = useRef(false)
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  useEffect(() => {
    if (!resendAt) return
    const interval = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))
      setRemaining(seconds)
      if (seconds === 0) window.clearInterval(interval)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [resendAt])

  useEffect(() => {
    if (sentTo) confirmationRef.current?.focus()
  }, [sentTo])

  const sendResetLink = async (email: string) => {
    if (requestPending.current || Date.now() < resendAt) return
    requestPending.current = true
    setServerError(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm`,
      })
      if (error) throw error
      setSentTo(email)
      setRemaining(RESEND_DELAY_SECONDS)
      setResendAt(Date.now() + RESEND_DELAY_SECONDS * 1000)
      return true
    } catch (error) {
      setServerError(getErrorMessage(error))
      return false
    } finally {
      requestPending.current = false
    }
  }

  const resend = async () => {
    if (!sentTo || remaining > 0 || requestPending.current) return
    setResending(true)
    setResendStatus('')
    try {
      if (await sendResetLink(sentTo)) setResendStatus('Another reset link is on its way, if an account exists for this email.')
    } finally {
      setResending(false)
    }
  }

  const onSubmit = async ({ email }: Values) => {
    await sendResetLink(email)
  }

  if (sentTo) {
    return (
      <section ref={confirmationRef} tabIndex={-1} aria-labelledby="recovery-title" className="outline-none">
        <AuthHeading
          eyebrow="PASSWORD RECOVERY"
          title="Check your inbox"
          titleId="recovery-title"
          icon={<span className="auth-recovery-icon"><MailCheck aria-hidden strokeWidth={1.5} /></span>}
          description="If an account exists for this email, you'll receive a link to choose a new password."
        />
        <div className="auth-recovery-summary">
          <p>Email address</p>
          <p>{sentTo}</p>
        </div>
        <p className="auth-recovery-help">It may take a few minutes to arrive. Check your spam or junk folder, and use the most recent reset link.</p>
        {serverError && (
          <Alert variant="destructive" className="auth-recovery-feedback">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <Button variant="outline" size="lg" className="w-full" onClick={resend} disabled={resending || remaining > 0} aria-busy={resending}>
          {resending && <Loader2 className="animate-spin" aria-hidden />}
          {resending ? 'Sending reset link…' : remaining > 0 ? `Resend link in ${remaining}s` : 'Resend reset link'}
        </Button>
        <p role="status" className="auth-recovery-status">{resendStatus}</p>
        <div className="auth-recovery-change">
          <button
            type="button"
            className="auth-text-link"
            disabled={resending}
            onClick={() => {
              setSentTo(null)
              setServerError(null)
              setResendStatus('')
              // Changing the address starts a new request, not a resend.
              setResendAt(0)
              setRemaining(0)
              window.requestAnimationFrame(() => setFocus('email', { shouldSelect: true }))
            }}
          >
            Use a different email
          </button>
        </div>
        <BackToSignIn />
      </section>
    )
  }

  return (
    <section aria-labelledby="recovery-title">
      <AuthHeading
        eyebrow="LET'S GET YOU BACK IN"
        title="Forgot password?"
        titleId="recovery-title"
        icon={<span className="auth-recovery-icon"><KeyRound aria-hidden strokeWidth={1.5} /></span>}
        description="It happens. Enter your email and we'll send you a link to reset your password."
      />
      <form onSubmit={(event) => { void handleSubmit(onSubmit)(event) }} noValidate aria-busy={isSubmitting}>
        <fieldset disabled={isSubmitting}>
          <legend className="sr-only">Request a password reset</legend>
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <FormField id="email" label="Email" error={errors.email?.message} hint="Use the email you sign in with.">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
              placeholder="you@example.com"
              {...register('email')}
            />
          </FormField>
          <Button type="submit" size="lg" className="auth-submit w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            <span aria-live="polite">{isSubmitting ? 'Sending reset link…' : 'Send reset link'}</span>
            {!isSubmitting && <ArrowRight aria-hidden />}
          </Button>
        </fieldset>
      </form>
      <p className="auth-recovery-note"><ShieldCheck aria-hidden />Your password stays the same until you choose a new one.</p>
      <BackToSignIn />
    </section>
  )
}
