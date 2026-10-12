import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Loader2, PartyPopper } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import type { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { FullPageSpinner } from '@/components/app/full-page-spinner'
import { PasswordChecklist } from '@/components/app/password-checklist'
import { PasswordInput } from '@/components/app/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { AuthHeading } from '@/layouts/auth-layout'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { newPasswordSchema } from '@/lib/validation'
import { HOME_BY_ROLE } from '@/routes/home'

type Values = z.infer<typeof newPasswordSchema>

/** Final step of an invitation (account activation) or password recovery. */
export function SetPasswordPage() {
  const { state, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isInvite = params.get('mode') === 'invite'
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: '', confirm: '' } })
  const password = useWatch({ control, name: 'password' }) ?? ''

  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'signed-out') return <Navigate to="/login" replace />

  const onSubmit = async ({ password }: Values) => {
    setServerError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setServerError(getErrorMessage(error))
      return
    }
    if (isInvite) {
      const { error: activateError } = await supabase.rpc('mark_account_activated')
      if (activateError) {
        setServerError(getErrorMessage(activateError))
        return
      }
      await refreshProfile()
    }
    toast.success(isInvite ? 'Your account is ready. Welcome!' : 'Password updated.')
    const role = state.profile?.role ?? 'tenant'
    navigate(HOME_BY_ROLE[role], { replace: true })
  }

  const name = state.profile?.full_name?.split(' ')[0]
  const Icon = isInvite ? PartyPopper : KeyRound

  return (
    <>
      <AuthHeading
        icon={
          <span className="mb-6 grid size-14 place-items-center rounded-xl border bg-card text-foreground/70">
            <Icon className="size-6" aria-hidden />
          </span>
        }
        title={isInvite ? `Welcome${name ? `, ${name}` : ''}!` : 'Choose a new password'}
        description={
          isInvite ? (
            <>
              Create a password to activate your account for{' '}
              <span className="font-semibold text-foreground">{state.session.user.email}</span>.
            </>
          ) : (
            <>
              Signed in as <span className="font-semibold text-foreground">{state.session.user.email}</span>.
            </>
          )
        }
      />
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <FormField id="password" label="New password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            className="h-11"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
        </FormField>
        <PasswordChecklist value={password} />
        <FormField id="confirm" label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            className="h-11"
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? 'confirm-error' : undefined}
            {...register('confirm')}
          />
        </FormField>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isInvite ? 'Activate account' : 'Save password'}
        </Button>
        {!isInvite && (
          <Link to="/" className="justify-self-center text-sm font-semibold text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        )}
      </form>
    </>
  )
}
