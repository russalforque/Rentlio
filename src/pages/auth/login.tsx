import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { PasswordInput } from '@/components/app/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthHeading } from '@/layouts/auth-layout'
import { getErrorMessage } from '@/lib/errors'
import { getRememberMe, setRememberMe, supabase } from '@/lib/supabase'

const schema = z.object({
  email: z.email('Enter a valid email address').trim(),
  password: z.string().min(1, 'Enter your password'),
})
type Values = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [serverError, setServerError] = useState<string | null>(null)
  /** Set when sign-in failed because the email is not confirmed yet. */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)
  const [remember, setRemember] = useState(getRememberMe)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: Values) => {
    setServerError(null)
    setUnconfirmed(null)
    setResent(false)
    // Read by the auth storage adapter when the new session is saved.
    setRememberMe(remember)
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      setServerError(getErrorMessage(error))
      if (error.code === 'email_not_confirmed') setUnconfirmed(values.email)
      return
    }
    navigate(from && from !== '/login' ? from : '/', { replace: true })
  }

  return (
    <section aria-labelledby="login-title">
      <AuthHeading
        eyebrow="YOUR RENTAL, ALL TOGETHER"
        title="Welcome back"
        description="Sign in to manage your rooms, bills and payments."
        titleId="login-title"
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
        <fieldset disabled={isSubmitting}>
          <legend className="sr-only">Sign in to Rentlio</legend>
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>
                {serverError}
                {unconfirmed && (
                  <button
                    type="button"
                    disabled={resent || resending}
                    onClick={async () => {
                      setResending(true)
                      try {
                        const { error } = await supabase.auth.resend({
                          type: 'signup',
                          email: unconfirmed,
                          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
                        })
                        if (error) setServerError(getErrorMessage(error))
                        else setResent(true)
                      } catch (error) {
                        setServerError(getErrorMessage(error))
                      } finally {
                        setResending(false)
                      }
                    }}
                    className="mt-1 block min-h-10 rounded font-semibold underline underline-offset-2 disabled:no-underline"
                  >
                    {resending ? 'Sending confirmation link…' : resent ? 'Confirmation link sent.' : 'Resend confirmation link'}
                  </button>
                )}
              </AlertDescription>
            </Alert>
          )}

          <FormField id="email" label="Email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              // Desktop only: on phones the keyboard would cover the form on arrival.
              autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </FormField>

          <FormField id="password" label="Password" error={errors.password?.message}>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="Your password"
              enterKeyHint="go"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </FormField>

          <div className="auth-login-options">
            <label className="-ml-1 flex min-h-11 w-fit cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 cursor-pointer rounded accent-primary"
              />
              Keep me signed in
            </label>
            <Link to="/forgot-password" className="auth-text-link">Forgot password?</Link>
          </div>

          <Button type="submit" size="lg" className="auth-submit w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            <span aria-live="polite">{isSubmitting ? 'Signing in…' : 'Sign in'}</span>
            {!isSubmitting && <ArrowRight />}
          </Button>
        </fieldset>
      </form>

      <div className="auth-switch">
        <p>New to Rentlio? <Link to="/register" className="auth-text-link gap-1">Create a tenant account <ArrowRight className="size-3.5" aria-hidden /></Link></p>
      </div>
      <p className="auth-entry-note">Tenant registrations are approved by your landlord.<br />Already invited? Use the link in your email.</p>
    </section>
  )
}
