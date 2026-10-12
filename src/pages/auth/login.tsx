import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Loader2, MailOpen } from 'lucide-react'
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
import { supabase } from '@/lib/supabase'

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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: Values) => {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      setServerError(getErrorMessage(error))
      return
    }
    navigate(from && from !== '/login' ? from : '/', { replace: true })
  }

  return (
    <>
      <AuthHeading title="Welcome back" description="Sign in to manage your rooms, bills and payments." />
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
            inputMode="email"
            autoFocus
            placeholder="you@example.com"
            className="h-11"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
        </FormField>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[13px] font-semibold">
              Password
            </label>
            <Link to="/forgot-password" className="text-[13px] font-semibold text-foreground underline-offset-2 hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            className="h-11"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password && (
            <p id="password-error" className="text-[13px] text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {isSubmitting ? 'Signing in…' : 'Sign in'}
          {!isSubmitting && <ArrowRight />}
        </Button>
      </form>

      <div className="mt-8 flex items-start gap-3 rounded-xl border bg-card p-4 text-[13px] text-muted-foreground">
        <MailOpen className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          <span className="font-semibold text-foreground">New tenant?</span> Open the invitation link in your email to
          activate your account. There is no public sign-up.
        </p>
      </div>
    </>
  )
}
