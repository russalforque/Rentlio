import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCurrency } from '@/hooks/use-settings'
import { firstOfNextMonthISO, todayISO } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { dateInput, moneyInput, optionalMoneyInput } from '@/lib/form-fields'
import { formatDate, formatMoney } from '@/lib/format'
import { optionalText, phoneText } from '@/lib/validation'
import {
  useAssignTenant,
  useEndLease,
  useMoveTenant,
  useRecordDeposit,
  useUpdateLeaseRent,
  useUpdateTenantProfile,
  type TenantOverview,
} from './api'
import { RoomPicker } from './room-picker'

interface DialogProps {
  tenant: TenantOverview
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Dialog shell that mounts its form only while open, so defaults are always fresh. */
function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && children}
      </DialogContent>
    </Dialog>
  )
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <DialogFooter>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {children}
      </Button>
    </DialogFooter>
  )
}

// Assign ---------------------------------------------------------------------------

const assignSchema = z.object({
  room_id: z.string().min(1, 'Choose a room'),
  start_date: dateInput('move-in date'),
  monthly_rent: moneyInput('Monthly rent'),
  deposit_amount: optionalMoneyInput(),
})

export function AssignRoomDialog({ tenant, open, onOpenChange }: DialogProps) {
  const assign = useAssignTenant()
  const form = useForm<z.input<typeof assignSchema>, unknown, z.output<typeof assignSchema>>({
    resolver: zodResolver(assignSchema),
    defaultValues: { room_id: '', start_date: todayISO(), monthly_rent: '', deposit_amount: '' },
  })
  const { register, control, handleSubmit, setValue, formState: { errors } } = form

  const onSubmit = (v: z.output<typeof assignSchema>) =>
    assign.mutate(
      { tenantId: tenant.id, roomId: v.room_id, startDate: v.start_date, monthlyRent: v.monthly_rent, depositAmount: v.deposit_amount },
      {
        onSuccess: () => {
          toast.success(`${tenant.full_name} assigned to a room`)
          form.reset()
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={`Assign ${tenant.full_name} to a room`}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormField id="assign-room" label="Room" error={errors.room_id?.message}>
          <Controller
            control={control}
            name="room_id"
            render={({ field }) => (
              <RoomPicker
                id="assign-room"
                value={field.value}
                invalid={!!errors.room_id}
                onChange={(room) => {
                  field.onChange(room.id)
                  setValue('monthly_rent', room.monthly_rent > 0 ? String(room.monthly_rent) : '')
                }}
              />
            )}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="assign-start" label="Move-in date" error={errors.start_date?.message}>
            <Input id="assign-start" type="date" {...register('start_date')} />
          </FormField>
          <FormField id="assign-rent" label="Agreed rent" error={errors.monthly_rent?.message}>
            <Input id="assign-rent" inputMode="decimal" className="tabular" aria-invalid={!!errors.monthly_rent} {...register('monthly_rent')} />
          </FormField>
        </div>
        <FormField
          id="assign-deposit"
          label="Security deposit received (optional)"
          error={errors.deposit_amount?.message}
          hint="Kept separate from rent."
        >
          <Input id="assign-deposit" inputMode="decimal" className="tabular" {...register('deposit_amount')} />
        </FormField>
        <SubmitButton pending={assign.isPending}>Assign room</SubmitButton>
      </form>
    </FormDialog>
  )
}

// Move ---------------------------------------------------------------------------

const moveSchema = z.object({
  room_id: z.string().min(1, 'Choose a room'),
  move_date: dateInput('move date'),
  monthly_rent: moneyInput('Monthly rent'),
})

export function MoveRoomDialog({ tenant, open, onOpenChange }: DialogProps) {
  const move = useMoveTenant()
  const form = useForm<z.input<typeof moveSchema>, unknown, z.output<typeof moveSchema>>({
    resolver: zodResolver(moveSchema),
    defaultValues: { room_id: '', move_date: firstOfNextMonthISO(), monthly_rent: '' },
  })
  const { register, control, handleSubmit, setValue, formState: { errors } } = form

  const onSubmit = (v: z.output<typeof moveSchema>) => {
    if (!tenant.lease_id) return
    move.mutate(
      { leaseId: tenant.lease_id, roomId: v.room_id, moveDate: v.move_date, monthlyRent: v.monthly_rent },
      {
        onSuccess: () => {
          toast.success(`${tenant.full_name} moved`)
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${tenant.full_name}`}
      description={`Currently in room ${tenant.room_number}. The deposit stays with the tenant.`}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormField id="move-room" label="New room" error={errors.room_id?.message}>
          <Controller
            control={control}
            name="room_id"
            render={({ field }) => (
              <RoomPicker
                id="move-room"
                value={field.value}
                invalid={!!errors.room_id}
                onChange={(room) => {
                  field.onChange(room.id)
                  setValue('monthly_rent', room.monthly_rent > 0 ? String(room.monthly_rent) : '')
                }}
              />
            )}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="move-date" label="Move date" error={errors.move_date?.message}>
            <Input id="move-date" type="date" {...register('move_date')} />
          </FormField>
          <FormField id="move-rent" label="New rent" error={errors.monthly_rent?.message}>
            <Input id="move-rent" inputMode="decimal" className="tabular" aria-invalid={!!errors.monthly_rent} {...register('monthly_rent')} />
          </FormField>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Moving on the 1st of a month keeps billing clean. A mid-month move bills both rooms for that month, which you
          can adjust on the bills.
        </p>
        <SubmitButton pending={move.isPending}>Move tenant</SubmitButton>
      </form>
    </FormDialog>
  )
}

// End lease --------------------------------------------------------------------------

const endSchema = z.object({ end_date: dateInput('move-out date') })

export function EndLeaseDialog({ tenant, open, onOpenChange }: DialogProps) {
  const end = useEndLease()
  const currency = useCurrency()
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof endSchema>>({
    resolver: zodResolver(endSchema),
    defaultValues: { end_date: todayISO() },
  })

  const onSubmit = ({ end_date }: z.infer<typeof endSchema>) => {
    if (!tenant.lease_id) return
    end.mutate(
      { leaseId: tenant.lease_id, endDate: end_date },
      {
        onSuccess: () => {
          toast.success(`Tenancy ended. Room ${tenant.room_number} is now vacant.`)
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="End tenancy"
      description={`${tenant.full_name} moves out of room ${tenant.room_number}. Bills and payment history are kept.`}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormField id="end-date" label="Move-out date" error={errors.end_date?.message}>
          <Input id="end-date" type="date" {...register('end_date')} />
        </FormField>
        {(tenant.outstanding_balance > 0 || tenant.deposit_balance > 0) && (
          <Alert>
            <AlertDescription className="grid gap-1">
              {tenant.outstanding_balance > 0 && (
                <span>
                  Unpaid bills: <b className="tabular">{formatMoney(tenant.outstanding_balance, currency)}</b>. They stay
                  open and can still be paid.
                </span>
              )}
              {tenant.deposit_balance > 0 && (
                <span>
                  Deposit held: <b className="tabular">{formatMoney(tenant.deposit_balance, currency)}</b>. Record a
                  refund or deduction afterwards in the Deposit section.
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
        <SubmitButton pending={end.isPending}>End tenancy</SubmitButton>
      </form>
    </FormDialog>
  )
}

// Rent ------------------------------------------------------------------------------

const rentSchema = z.object({ rent: moneyInput('Monthly rent') })

export function LeaseRentDialog({ tenant, open, onOpenChange }: DialogProps) {
  const update = useUpdateLeaseRent()
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof rentSchema>, unknown, z.output<typeof rentSchema>>({
    resolver: zodResolver(rentSchema),
    defaultValues: { rent: String(tenant.lease_rent ?? '') },
  })

  const onSubmit = ({ rent }: z.output<typeof rentSchema>) => {
    if (!tenant.lease_id) return
    update.mutate(
      { leaseId: tenant.lease_id, rent },
      {
        onSuccess: () => {
          toast.success('Rent updated')
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change agreed rent"
      description="Applies to bills generated from now on. Existing bills are not changed."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormField id="lease-rent" label="Monthly rent" error={errors.rent?.message}>
          <Input id="lease-rent" inputMode="decimal" className="tabular" autoFocus aria-invalid={!!errors.rent} {...register('rent')} />
        </FormField>
        <SubmitButton pending={update.isPending}>Save rent</SubmitButton>
      </form>
    </FormDialog>
  )
}

// Deposit ---------------------------------------------------------------------------

const DEPOSIT_TYPES = [
  { value: 'received', label: 'Deposit received' },
  { value: 'deduction', label: 'Deduction (e.g. damages)' },
  { value: 'refund', label: 'Refund to tenant' },
] as const

const depositSchema = z
  .object({
    type: z.enum(['received', 'deduction', 'refund']),
    amount: moneyInput('Amount').refine((v) => v > 0, 'Amount must be greater than zero'),
    date: dateInput(),
    notes: optionalText(500),
  })
  .refine((v) => v.type === 'received' || v.notes !== null, {
    path: ['notes'],
    message: 'Add a short reason for the deduction or refund',
  })

export function DepositDialog({ tenant, leaseId, open, onOpenChange }: DialogProps & { leaseId: string }) {
  const record = useRecordDeposit()
  const currency = useCurrency()
  const { register, control, handleSubmit, formState: { errors } } = useForm<
    z.input<typeof depositSchema>,
    unknown,
    z.output<typeof depositSchema>
  >({
    resolver: zodResolver(depositSchema),
    defaultValues: { type: tenant.deposit_balance > 0 ? 'refund' : 'received', amount: '', date: todayISO(), notes: '' },
  })

  const onSubmit = (v: z.output<typeof depositSchema>) =>
    record.mutate(
      { leaseId, type: v.type, amount: v.amount, date: v.date, notes: v.notes },
      {
        onSuccess: () => {
          toast.success('Deposit ledger updated')
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record deposit transaction"
      description={`Current balance held: ${formatMoney(tenant.deposit_balance, currency)}`}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormField id="deposit-type" label="Type">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="deposit-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPOSIT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="deposit-amount" label="Amount" error={errors.amount?.message}>
            <Input id="deposit-amount" inputMode="decimal" className="tabular" aria-invalid={!!errors.amount} {...register('amount')} />
          </FormField>
          <FormField id="deposit-date" label="Date" error={errors.date?.message}>
            <Input id="deposit-date" type="date" {...register('date')} />
          </FormField>
        </div>
        <FormField id="deposit-notes" label="Notes" error={errors.notes?.message}>
          <Textarea id="deposit-notes" rows={2} aria-invalid={!!errors.notes} {...register('notes')} />
        </FormField>
        <SubmitButton pending={record.isPending}>Save</SubmitButton>
      </form>
    </FormDialog>
  )
}

// Edit details ------------------------------------------------------------------------

const detailsSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter the tenant name').max(120),
  phone: phoneText,
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: phoneText,
})

export function EditTenantDialog({ tenant, open, onOpenChange }: DialogProps) {
  const update = useUpdateTenantProfile()
  const { register, handleSubmit, formState: { errors } } = useForm<
    z.input<typeof detailsSchema>,
    unknown,
    z.output<typeof detailsSchema>
  >({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      full_name: tenant.full_name,
      phone: tenant.phone ?? '',
      emergency_contact_name: tenant.emergency_contact_name ?? '',
      emergency_contact_phone: tenant.emergency_contact_phone ?? '',
    },
  })

  const onSubmit = (values: z.output<typeof detailsSchema>) =>
    update.mutate(
      { id: tenant.id, values },
      {
        onSuccess: () => {
          toast.success('Tenant details saved')
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Edit tenant details">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormField id="edit-name" label="Full name" error={errors.full_name?.message}>
          <Input id="edit-name" aria-invalid={!!errors.full_name} {...register('full_name')} />
        </FormField>
        <FormField id="edit-phone" label="Phone" error={errors.phone?.message}>
          <Input id="edit-phone" type="tel" aria-invalid={!!errors.phone} {...register('phone')} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="edit-ec-name" label="Emergency contact" error={errors.emergency_contact_name?.message}>
            <Input id="edit-ec-name" {...register('emergency_contact_name')} />
          </FormField>
          <FormField id="edit-ec-phone" label="Their phone" error={errors.emergency_contact_phone?.message}>
            <Input id="edit-ec-phone" type="tel" aria-invalid={!!errors.emergency_contact_phone} {...register('emergency_contact_phone')} />
          </FormField>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Login email: {tenant.email}. Invited {formatDate(tenant.invited_at?.slice(0, 10))}.
        </p>
        <SubmitButton pending={update.isPending}>Save details</SubmitButton>
      </form>
    </FormDialog>
  )
}
