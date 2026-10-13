import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Loader2, LockKeyhole, Mail, UserPlus } from 'lucide-react'
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

/** Leading glyph inside a 44px-tall field. */
const fieldIcon = 'pointer-events-none absolute z-10 top-[22px] left-3.5 size-4 -translate-y-1/2 text-muted-foreground'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [serverError, setServerError] = useState<string | null>(null)
  /** Set when sign-in failed because the email is not confirmed yet. */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
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
    <>
      <AuthHeading title="Welcome back" description="Sign in to manage your rooms, bills and payments." />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>
              {serverError}
              {unconfirmed && (
                <button
                  type="button"
                  disabled={resent}
                  onClick={async () => {
                    const { error } = await supabase.auth.resend({
                      type: 'signup',
                      email: unconfirmed,
                      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
                    })
                    if (error) setServerError(getErrorMessage(error))
                    else setResent(true)
                  }}
                  className="mt-1 block font-semibold underline underline-offset-2 disabled:no-underline"
                >
                  {resent ? 'Confirmation link sent.' : 'Resend confirmation link'}
                </button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <FormField id="email" label="Email" error={errors.email?.message}>
          <div className="relative">
            <Mail className={fieldIcon} aria-hidden />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              // Desktop only: on phones the keyboard would cover the form on arrival.
              autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
              placeholder="you@example.com"
              className="h-11 pl-10"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </div>
        </FormField>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="rounded text-[13px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <LockKeyhole className={fieldIcon} aria-hidden />
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="Your password"
              className="h-11 pl-10"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </div>
          {errors.password && (
            <p id="password-error" className="text-[13px] text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <label className="-ml-1 flex min-h-10 w-fit cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 cursor-pointer rounded accent-primary"
          />
          Keep me signed in
        </label>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {isSubmitting ? 'Signing in…' : 'Sign in'}
          {!isSubmitting && <ArrowRight />}
        </Button>
      </form>

      <div className="my-7 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        New here?
        <span className="h-px flex-1 bg-border" />
      </div>

      <Link
        to="/register"
        className="surface flex items-start gap-3 p-4 text-[13px] text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted text-foreground/80">
          <UserPlus className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">Renting here? Register as a tenant</span>
          Your landlord approves new accounts. Got an invitation email? Use its link instead.
        </span>
        <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden />
      </Link>
    </>
  )
}
