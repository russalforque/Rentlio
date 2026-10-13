import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Camera, Loader2, LogOut, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { PageHeader } from '@/components/app/page-header'
import { PasswordInput } from '@/components/app/password-input'
import { Button } from '@/components/ui/button'
import { SettingsSection, StatusPill } from '@/components/app/panel'
import { Input } from '@/components/ui/input'
import { useRemoveAvatar, useUploadAvatar } from '@/features/account/profile-photo'
import { UserAvatar } from '@/features/account/user-avatar'
import { NotificationPreferencesSection } from '@/features/notifications/preferences-section'
import { useAuth, useProfile } from '@/hooks/use-auth'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { newPasswordSchema, optionalText, phoneText } from '@/lib/validation'

const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter your name').max(120),
  phone: phoneText,
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: phoneText,
})
type ProfileInput = z.input<typeof profileSchema>
type ProfileOutput = z.output<typeof profileSchema>

function PhotoCard() {
  const profile = useProfile()
  const upload = useUploadAvatar()
  const remove = useRemoveAvatar()
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = upload.isPending || remove.isPending

  const onFile = (file: File | undefined) => {
    if (!file) return
    upload.mutate(file, {
      onSuccess: () => toast.success('Profile photo updated'),
      onError: (err) => toast.error(getErrorMessage(err)),
    })
  }

  return (
    <section aria-label="Profile photo" className="surface overflow-hidden">
      <div className="h-20 bg-gradient-to-r from-chip-violet/15 via-chip-blue/10 to-chart-2/15 sm:h-24" aria-hidden />
      <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-end gap-4">
          <UserAvatar
            path={profile.avatar_path}
            name={profile.full_name}
            email={profile.email}
            className="-mt-10 size-20 shrink-0 ring-4 ring-card sm:size-24"
            fallbackClassName="bg-primary text-2xl text-primary-foreground"
          />
          <div className="min-w-0 pb-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="truncate text-lg font-semibold">{profile.full_name || 'Your account'}</span>
              <StatusPill tone={profile.role === 'tenant' ? 'info' : 'brand'} className="capitalize">
                {profile.role}
              </StatusPill>
            </p>
            <p className="truncate text-[13px] text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:pb-1">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
            {profile.avatar_path ? 'Change photo' : 'Upload photo'}
          </Button>
          {profile.avatar_path && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast.success('Profile photo removed'),
                  onError: (err) => toast.error(getErrorMessage(err)),
                })
              }
            >
              {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="border-t bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
        {profile.role === 'tenant'
          ? 'Your photo helps your landlord recognise you. Only you and your landlord can see it.'
          : 'Your photo is shown on your account. Only you can see it.'}
      </p>
    </section>
  )
}

function ProfileCard() {
  const profile = useProfile()
  const { refreshProfile } = useAuth()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileInput, unknown, ProfileOutput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile.full_name,
      phone: profile.phone ?? '',
      emergency_contact_name: profile.emergency_contact_name ?? '',
      emergency_contact_phone: profile.emergency_contact_phone ?? '',
    },
  })

  const save = useMutation({
    mutationFn: async (values: ProfileOutput) => {
      const { error } = await supabase.from('profiles').update(values).eq('id', profile.id)
      if (error) throw error
    },
    onSuccess: async (_data, values) => {
      await refreshProfile()
      reset({
        full_name: values.full_name,
        phone: values.phone ?? '',
        emergency_contact_name: values.emergency_contact_name ?? '',
        emergency_contact_phone: values.emergency_contact_phone ?? '',
      })
      toast.success('Profile saved')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
      <SettingsSection
        title="Personal details"
        description={profile.role === 'tenant' ? 'Your landlord uses these details to reach you.' : 'Shown to tenants as their landlord contact.'}
        footer={
          <Button type="submit" disabled={!isDirty || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="full_name" label="Full name" error={errors.full_name?.message}>
            <Input id="full_name" autoComplete="name" aria-invalid={!!errors.full_name} {...register('full_name')} />
          </FormField>
          <FormField id="email" label="Email" hint="Contact your landlord to change your login email.">
            <Input id="email" value={profile.email ?? ''} readOnly disabled />
          </FormField>
          <FormField id="phone" label="Phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" autoComplete="tel" aria-invalid={!!errors.phone} {...register('phone')} />
          </FormField>
          <div className="hidden sm:block" />
          <FormField id="emergency_contact_name" label="Emergency contact" error={errors.emergency_contact_name?.message}>
            <Input id="emergency_contact_name" {...register('emergency_contact_name')} />
          </FormField>
          <FormField
            id="emergency_contact_phone"
            label="Emergency contact phone"
            error={errors.emergency_contact_phone?.message}
          >
            <Input
              id="emergency_contact_phone"
              type="tel"
              aria-invalid={!!errors.emergency_contact_phone}
              {...register('emergency_contact_phone')}
            />
          </FormField>
        </div>
      </SettingsSection>
    </form>
  )
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, 'Enter your current password'), next: newPasswordSchema })
  .transform(({ current, next }) => ({ current, ...next }))
type ChangePasswordInput = { current: string; next: z.input<typeof newPasswordSchema> }
type ChangePasswordOutput = z.output<typeof changePasswordSchema>

function PasswordCard() {
  const profile = useProfile()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordInput, unknown, ChangePasswordOutput>({ resolver: zodResolver(changePasswordSchema) })

  const change = useMutation({
    mutationFn: async ({ current, password }: ChangePasswordOutput) => {
      // Re-check the current password so an unattended signed-in device cannot be
      // used to take over the account. This also counts as a fresh sign-in for
      // Supabase's "secure password change" setting.
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: profile.email ?? '', password: current })
      if (verifyError) {
        if (verifyError.code === 'invalid_credentials') {
          setError('current', { message: 'Your current password is incorrect' })
          return false
        }
        throw verifyError
      }
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      return true
    },
    onSuccess: (changed) => {
      if (!changed) return
      reset({ current: '', next: { password: '', confirm: '' } })
      toast.success('Password changed')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <form onSubmit={handleSubmit((v) => change.mutate(v))} noValidate>
      <SettingsSection
        title="Password"
        description="At least 8 characters, with letters and numbers."
        footer={
          <Button type="submit" variant="outline" disabled={change.isPending}>
            {change.isPending && <Loader2 className="animate-spin" />}
            Change password
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField id="current-password" label="Current password" error={errors.current?.message}>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                aria-invalid={!!errors.current}
                {...register('current')}
              />
            </FormField>
          </div>
          <FormField id="new-password" label="New password" error={errors.next?.password?.message}>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              aria-invalid={!!errors.next?.password}
              {...register('next.password')}
            />
          </FormField>
          <FormField id="confirm-password" label="Confirm new password" error={errors.next?.confirm?.message}>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              aria-invalid={!!errors.next?.confirm}
              {...register('next.confirm')}
            />
          </FormField>
        </div>
      </SettingsSection>
    </form>
  )
}

export function AccountPage() {
  const profile = useProfile()
  const { signOut } = useAuth()
  return (
    <div className="space-y-8">
      <PageHeader
        title={profile.role === 'tenant' ? 'Profile' : 'Account'}
        description="Your profile and sign-in settings."
      />
      <PhotoCard />
      <ProfileCard />
      <NotificationPreferencesSection />
      <PasswordCard />
      {/* Phones: tenants have no "More" sheet, so sign-out lives here too. */}
      <Button variant="outline" size="lg" className="w-full text-destructive hover:text-destructive md:hidden" onClick={signOut}>
        <LogOut /> Sign out
      </Button>
    </div>
  )
}
