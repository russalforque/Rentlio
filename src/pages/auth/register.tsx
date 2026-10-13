import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Loader2, MailCheck, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { PasswordChecklist } from '@/components/app/password-checklist'
import { PasswordInput } from '@/components/app/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthHeading } from '@/layouts/auth-layout'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { passwordSchema, phoneText } from '@/lib/validation'

const schema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your full name').max(120, 'Use at most 120 characters'),
    email: z.email('Enter a valid email address').trim().toLowerCase().max(320),
    phone: phoneText,
    requested_room: z
      .string()
      .trim()
      .min(1, 'Enter the room you rent or want to rent')
      .max(20, 'Use at most 20 characters'),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Input = z.input<typeof schema>
type Output = z.output<typeof schema>

const RESEND_COOLDOWN = 60
const confirmUrl = () => `${window.location.origin}/auth/confirm`

/** "Check your inbox" step. Says the same thing whether or not the email was already registered. */
function VerifyEmail({ email, onBack }: { email: string; onBack: () => void }) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const resend = async () => {
    setSending(true)
    setStatus(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmUrl() } })
    setSending(false)
    if (error) setStatus({ tone: 'error', text: getErrorMessage(error) })
    else {
      setStatus({ tone: 'ok', text: 'A new link is on its way.' })
      setCooldown(RESEND_COOLDOWN)
    }
  }

  return (
    <div role="status">
      <AuthHeading
        icon={
          <span className="mb-6 grid size-14 place-items-center rounded-xl border bg-card text-foreground/70">
            <MailCheck className="size-6" aria-hidden />
          </span>
        }
        title="Verify your email"
        description={
          <>
            We sent a confirmation link to <span className="font-semibold break-all text-foreground">{email}</span>.
            Open it on this device to continue.
          </>
        }
      />

      <ol className="surface grid gap-3 p-4 text-[13px] text-muted-foreground">
        {[
          'Confirm your email with the link we sent.',
          'Your landlord reviews your request and confirms who you are.',
          'Once approved, sign in to see your room, bills and payments.',
        ].map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-muted text-[11px] font-semibold text-foreground">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      {status && (
        <Alert variant={status.tone === 'error' ? 'destructive' : 'default'} className="mt-4">
          <AlertDescription>{status.text}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid gap-2">
        <Button variant="outline" size="lg" onClick={resend} disabled={sending || cooldown > 0}>
          {sending && <Loader2 className="animate-spin" />}
          {cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Wrong address?{' '}
        <button type="button" onClick={onBack} className="font-semibold text-foreground underline-offset-2 hover:underline">
          Start over
        </button>
        . Already registered? Just sign in.
      </p>
    </div>
  )
}

export function RegisterPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', phone: '', requested_room: '', password: '', confirm: '' },
  })
  const password = useWatch({ control, name: 'password' }) ?? ''

  const onSubmit = async (v: Output) => {
    setServerError(null)
    const { error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: confirmUrl(),
        // Unverified claims for the landlord to review. They grant nothing.
        data: { full_name: v.full_name, phone: v.phone, requested_room: v.requested_room },
      },
    })
    if (error) {
      setServerError(getErrorMessage(error))
      return
    }
    // Supabase answers the same way for an address that is already registered,
    // so this page never reveals which emails have accounts.
    setSentTo(v.email)
  }

  if (sentTo) {
    return (
      <VerifyEmail
        email={sentTo}
        onBack={() => {
          setSentTo(null)
          reset()
        }}
      />
    )
  }

  return (
    <>
      <AuthHeading
        title="Register as a tenant"
        description="Create your login. Your landlord confirms who you are before you can see your rental records."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <FormField id="full_name" label="Full name" error={errors.full_name?.message}>
          <Input id="full_name" autoComplete="name" className="h-11" aria-invalid={!!errors.full_name} {...register('full_name')} />
        </FormField>
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-11"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="requested_room" label="Room number" error={errors.requested_room?.message}>
            <Input
              id="requested_room"
              autoComplete="off"
              placeholder="e.g. 104"
              className="h-11"
              aria-invalid={!!errors.requested_room}
              {...register('requested_room')}
            />
          </FormField>
          <FormField id="phone" label="Phone (optional)" error={errors.phone?.message}>
            <Input id="phone" type="tel" autoComplete="tel" className="h-11" aria-invalid={!!errors.phone} {...register('phone')} />
          </FormField>
        </div>
        <FormField id="password" label="Password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            className="h-11"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <PasswordChecklist value={password} />
        <FormField id="confirm" label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput id="confirm" autoComplete="new-password" className="h-11" aria-invalid={!!errors.confirm} {...register('confirm')} />
        </FormField>

        <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {isSubmitting ? 'Creating account…' : 'Create account'}
          {!isSubmitting && <ArrowRight />}
        </Button>
      </form>

      <div className="surface mt-6 flex items-start gap-3 p-4 text-[13px] text-muted-foreground">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted text-foreground/80">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <p>
          <span className="font-semibold text-foreground">Your records stay private.</span> Nothing is shared with your
          account until your landlord verifies your identity, so a room number alone never grants access.
        </p>
      </div>

      <Link
        to="/login"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Already have an account? Sign in
      </Link>
    </>
  )
}
