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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useRemoveAvatar, useUploadAvatar } from '@/features/account/profile-photo'
import { UserAvatar } from '@/features/account/user-avatar'
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
    <Card>
      <CardHeader>
        <CardTitle>Profile photo</CardTitle>
        <CardDescription>
          {profile.role === 'tenant'
            ? 'Helps your landlord recognise you. Only you and your landlord can see it.'
            : 'Shown on your account. Only you can see it.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <UserAvatar
          path={profile.avatar_path}
          name={profile.full_name}
          email={profile.email}
          className="size-20"
          fallbackClassName="bg-primary/10 text-2xl text-primary"
        />
        <div className="flex flex-wrap gap-2">
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
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
        <CardDescription>
          {profile.role === 'tenant'
            ? 'Your landlord uses these details to reach you.'
            : 'Shown to tenants as their landlord contact.'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="full_name" label="Full name" error={errors.full_name?.message}>
            <Input id="full_name" autoComplete="name" aria-invalid={!!errors.full_name} {...register('full_name')} />
          </FormField>
          <FormField id="email" label="Email" hint="Contact your landlord to change your login email.">
            <Input id="email" value={profile.email} readOnly disabled />
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
        </CardContent>
        <CardFooter className="mt-6 justify-end border-t pt-6 max-sm:[&>button]:w-full">
          <Button type="submit" disabled={!isDirty || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function PasswordCard() {
  type Values = z.infer<typeof newPasswordSchema>
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(newPasswordSchema) })

  const change = useMutation({
    mutationFn: async ({ password }: Values) => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    },
    onSuccess: () => {
      reset({ password: '', confirm: '' })
      toast.success('Password changed')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>At least 8 characters, with letters and numbers.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit((v) => change.mutate(v))} noValidate>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="new-password" label="New password" error={errors.password?.message}>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </FormField>
          <FormField id="confirm-password" label="Confirm new password" error={errors.confirm?.message}>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...register('confirm')}
            />
          </FormField>
        </CardContent>
        <CardFooter className="mt-6 justify-end border-t pt-6 max-sm:[&>button]:w-full">
          <Button type="submit" variant="outline" disabled={change.isPending}>
            {change.isPending && <Loader2 className="animate-spin" />}
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export function AccountPage() {
  const profile = useProfile()
  const { signOut } = useAuth()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={profile.role === 'tenant' ? 'Profile' : 'Account'}
        description="Your profile and sign-in settings."
      />
      <PhotoCard />
      <ProfileCard />
      <PasswordCard />
      {/* Phones: tenants have no "More" sheet, so sign-out lives here too. */}
      <Button variant="outline" size="lg" className="w-full text-destructive hover:text-destructive md:hidden" onClick={signOut}>
        <LogOut /> Sign out
      </Button>
    </div>
  )
}
