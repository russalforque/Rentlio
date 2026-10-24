import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Send, UserPlus, UserRound, Wifi } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { ChoiceCards } from '@/components/app/choice-cards'
import { FormField } from '@/components/app/form-field'
import { ResponsiveSheet } from '@/components/app/responsive-sheet'
import { useSheetFormState } from '@/hooks/use-sheet-form-state'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { todayISO } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { optionalMoneyInput } from '@/lib/form-fields'
import { phoneText } from '@/lib/validation'
import { useCreateManualTenant, useInviteTenant, useVacantRooms } from './api'
import { RoomPicker } from './room-picker'

type AccountType = 'manual' | 'portal'

const schema = z
  .object({
    account: z.enum(['manual', 'portal']),
    full_name: z.string().trim().min(1, 'Enter the tenant name').max(120),
    // Only required (and validated) for portal access.
    email: z.string().trim().toLowerCase(),
    phone: phoneText,
    assign: z.boolean(),
    room_id: z.string(),
    start_date: z.string(),
    monthly_rent: optionalMoneyInput(),
    deposit_amount: optionalMoneyInput(),
  })
  .superRefine((v, ctx) => {
    if (v.account === 'portal' && !z.email().safeParse(v.email).success) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address' })
    }
    if (!v.assign) return
    if (!v.room_id) ctx.addIssue({ code: 'custom', path: ['room_id'], message: 'Choose a room' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.start_date)) {
      ctx.addIssue({ code: 'custom', path: ['start_date'], message: 'Choose a move-in date' })
    }
    if (v.monthly_rent === null) ctx.addIssue({ code: 'custom', path: ['monthly_rent'], message: 'Enter the monthly rent' })
  })
type Input = z.input<typeof schema>
type Output = z.output<typeof schema>

export function AddTenantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {open && <AddTenantForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </ResponsiveSheet>
  )
}

function AddTenantForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const invite = useInviteTenant()
  const createManual = useCreateManualTenant()
  const { data: vacant } = useVacantRooms()
  const hasVacancy = (vacant?.length ?? 0) > 0
  const [account, setAccount] = useState<AccountType>('manual')

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: {
      account: 'manual',
      full_name: '',
      email: '',
      phone: '',
      assign: true,
      room_id: '',
      start_date: todayISO(),
      monthly_rent: '',
      deposit_amount: '',
    },
  })
  const assign = useWatch({ control, name: 'assign' }) && hasVacancy
  const pending = invite.isPending || createManual.isPending
  useSheetFormState(isDirty, pending)

  const chooseAccount = (next: AccountType) => {
    setAccount(next)
    setValue('account', next)
  }

  const onSubmit = (v: Output) => {
    const assignment =
      v.assign && hasVacancy
        ? { room_id: v.room_id, start_date: v.start_date, monthly_rent: v.monthly_rent, deposit_amount: v.deposit_amount }
        : null

    if (v.account === 'manual') {
      createManual.mutate(
        { full_name: v.full_name, phone: v.phone, assignment },
        {
          onSuccess: (tenantId) => {
            toast.success(assignment ? `${v.full_name} was added and housed` : `${v.full_name} was added`)
            onDone()
            navigate(`/tenants/${tenantId}`)
          },
          onError: (err) => toast.error(getErrorMessage(err)),
        },
      )
      return
    }

    invite.mutate(
      { full_name: v.full_name, email: v.email, phone: v.phone, tenant_id: null, assignment },
      {
        onSuccess: (result) => {
          if (result.assignment_error) {
            toast.warning(`Invitation sent, but the room was not assigned: ${result.assignment_error}`)
          } else {
            toast.success(`Invitation sent to ${v.email}`)
          }
          onDone()
          navigate(`/tenants/${result.tenant_id}`)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Add a tenant</DialogTitle>
        <DialogDescription>Billing and room occupancy work the same either way.</DialogDescription>
      </DialogHeader>

      <ChoiceCards<AccountType>
        label="Account type"
        value={account}
        onChange={chooseAccount}
        options={[
          {
            value: 'manual',
            icon: UserRound,
            title: 'No portal access',
            description: 'No email needed. You record their payments, e.g. cash.',
          },
          {
            value: 'portal',
            icon: Wifi,
            title: 'With portal access',
            description: 'We email an invite so they can see bills and pay online.',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField id="full_name" label="Full name" error={errors.full_name?.message}>
            <Input id="full_name" autoComplete="off" aria-invalid={!!errors.full_name} {...register('full_name')} />
          </FormField>
        </div>
        {account === 'portal' && (
          <FormField id="tenant-email" label="Email" error={errors.email?.message}>
            <Input id="tenant-email" type="email" inputMode="email" autoComplete="off" aria-invalid={!!errors.email} {...register('email')} />
          </FormField>
        )}
        <div className={account === 'manual' ? 'sm:col-span-2' : undefined}>
          <FormField id="tenant-phone" label="Phone (optional)" error={errors.phone?.message}>
            <Input id="tenant-phone" type="tel" autoComplete="off" aria-invalid={!!errors.phone} {...register('phone')} />
          </FormField>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between gap-4 p-3">
          <div>
            <Label htmlFor="assign">Assign a room now</Label>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {hasVacancy ? 'Starts monthly billing. You can also do this later.' : 'There are no vacant rooms right now.'}
            </p>
          </div>
          <Controller
            control={control}
            name="assign"
            render={({ field }) => (
              <Switch id="assign" checked={field.value && hasVacancy} onCheckedChange={field.onChange} disabled={!hasVacancy} />
            )}
          />
        </div>

        {assign && (
          <div className="grid gap-4 border-t p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField id="room_id" label="Room" error={errors.room_id?.message}>
                <Controller
                  control={control}
                  name="room_id"
                  render={({ field }) => (
                    <RoomPicker
                      id="room_id"
                      value={field.value}
                      invalid={!!errors.room_id}
                      onChange={(room) => {
                        field.onChange(room.id)
                        setValue('monthly_rent', room.monthly_rent > 0 ? String(room.monthly_rent) : '', {
                          shouldValidate: false,
                        })
                      }}
                    />
                  )}
                />
              </FormField>
            </div>
            <FormField id="start_date" label="Move-in date" error={errors.start_date?.message}>
              <Input id="start_date" type="date" aria-invalid={!!errors.start_date} {...register('start_date')} />
            </FormField>
            <FormField
              id="monthly_rent"
              label="Agreed monthly rent"
              error={errors.monthly_rent?.message}
              hint="Pre-filled from the room."
            >
              <Input id="monthly_rent" inputMode="decimal" className="tabular" aria-invalid={!!errors.monthly_rent} {...register('monthly_rent')} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField
                id="deposit_amount"
                label="Security deposit received (optional)"
                error={errors.deposit_amount?.message}
                hint="Kept separate from rent. Leave blank if none."
              >
                <Input id="deposit_amount" inputMode="decimal" className="tabular" aria-invalid={!!errors.deposit_amount} {...register('deposit_amount')} />
              </FormField>
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : account === 'portal' ? <Send /> : <UserPlus />}
          {account === 'portal' ? 'Add and send invitation' : 'Add tenant'}
        </Button>
      </DialogFooter>
    </form>
  )
}
