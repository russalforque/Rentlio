import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { useState } from 'react'
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

const schema = z.object({ email: z.email('Enter a valid email address').trim() })
type Values = z.infer<typeof schema>

function BackToSignIn() {
  return (
    <Link
      to="/login"
      className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Back to sign in
    </Link>
  )
}

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email }: Values) => {
    setServerError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    })
    if (error) setServerError(getErrorMessage(error))
    else setSentTo(email)
  }

  if (sentTo) {
    return (
      <div role="status">
        <AuthHeading
          icon={
            <span className="mb-6 grid size-14 place-items-center rounded-xl border bg-card text-foreground/70">
              <MailCheck className="size-6" aria-hidden />
            </span>
          }
          title="Check your inbox"
          description={
            <>
              If an account exists for <span className="font-semibold text-foreground">{sentTo}</span>, a link to reset
              your password is on its way. It can take a minute to arrive.
            </>
          }
        />
        <Button variant="outline" size="lg" className="w-full" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
        <BackToSignIn />
      </div>
    )
  }

  return (
    <>
      <AuthHeading title="Reset your password" description="Enter your email and we’ll send you a secure link to choose a new one." />
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            className="h-11"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Send reset link
        </Button>
      </form>
      <BackToSignIn />
    </>
  )
}
