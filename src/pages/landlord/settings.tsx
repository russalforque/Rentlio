import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { NativeSelect } from '@/components/app/native-select'
import { PageHeader } from '@/components/app/page-header'
import { SettingsSection } from '@/components/app/panel'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { settingsQueryKey, useSettings } from '@/hooks/use-settings'
import { useSetWaterRate, useWaterRateSchedule } from '@/features/billing/api'
import { PaymentAccountSettings } from '@/features/payments/payment-account-settings'
import { DemoDataSection } from '@/features/demo-data/demo-data-section'
import type { Tables } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/errors'
import { intInput } from '@/lib/form-fields'
import { supabase } from '@/lib/supabase'
import { formatDate, formatMoney } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { optionalText, phoneText } from '@/lib/validation'

const rate = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .refine((v) => /^\d+(\.\d{1,4})?$/.test(v), 'Enter a valid number, e.g. 12.50')
    .transform(Number)

const schema = z.object({
  property_name: z.string().trim().min(1, 'Enter a property name').max(120),
  property_address: optionalText(300),
  currency_code: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency'),
  timezone: z.string().min(1, 'Choose a timezone'),
  electricity_rate: rate('electricity rate'),
  auto_billing_enabled: z.boolean(),
  rent_reminders_enabled: z.boolean(),
  reminder_days_before: intInput(0, 14),
  reminder_on_due_date: z.boolean(),
  reminder_days_after: intInput(0, 30),
  payment_instructions: optionalText(2000),
  online_payments_enabled: z.boolean(),
  contact_name: optionalText(120),
  contact_phone: phoneText,
  contact_email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address')
    .transform((v) => (v === '' ? null : v)),
  house_rules: optionalText(5000),
})
type Input = z.input<typeof schema>
type Output = z.output<typeof schema>

const TIMEZONES = Intl.supportedValuesOf('timeZone')
const CURRENCIES = Intl.supportedValuesOf('currency')

function toForm(s: Tables<'app_settings'>): Input {
  return {
    property_name: s.property_name,
    property_address: s.property_address ?? '',
    currency_code: s.currency_code,
    timezone: s.timezone,
    electricity_rate: String(s.electricity_rate),
    auto_billing_enabled: s.auto_billing_enabled,
    rent_reminders_enabled: s.rent_reminders_enabled,
    reminder_days_before: String(s.reminder_days_before),
    reminder_on_due_date: s.reminder_on_due_date,
    reminder_days_after: String(s.reminder_days_after),
    payment_instructions: s.payment_instructions ?? '',
    online_payments_enabled: s.online_payments_enabled,
    contact_name: s.contact_name ?? '',
    contact_phone: s.contact_phone ?? '',
    contact_email: s.contact_email ?? '',
    house_rules: s.house_rules ?? '',
  }
}

function SettingsForm({ settings }: { settings: Tables<'app_settings'> }) {
  const qc = useQueryClient()
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Input, unknown, Output>({ resolver: zodResolver(schema), defaultValues: toForm(settings) })

  const save = useMutation({
    mutationFn: async (values: Output) => {
      const { data, error } = await supabase.from('app_settings').update(values).eq('id', true).select('*').single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.setQueryData(settingsQueryKey, data)
      reset(toForm(data))
      toast.success('Settings saved')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const remindersOn = useWatch({ control, name: 'rent_reminders_enabled' })
  const daysBefore = Number(useWatch({ control, name: 'reminder_days_before' })) || 0
  const onDueDate = useWatch({ control, name: 'reminder_on_due_date' })
  const daysAfter = Number(useWatch({ control, name: 'reminder_days_after' })) || 0
  const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
  const stages = [
    daysBefore > 0 && `${plural(daysBefore)} before`,
    onDueDate && 'on the due date',
    daysAfter > 0 && `${plural(daysAfter)} after if unpaid`,
  ].filter(Boolean)
  const reminderSummary = !remindersOn
    ? 'Off. Tenants still get a notice when each bill is issued.'
    : stages.length
      ? `Sent ${stages.join(', ').replace(/, ([^,]*)$/, ' and $1')}, from 8 AM.`
      : 'No reminder stages are on.'
  const submitSettings = handleSubmit((v) => save.mutate(v))

  return (
    <div className="space-y-8 pb-4 lg:space-y-10">
    <form onSubmit={submitSettings} noValidate className="space-y-8 lg:space-y-10">
      <SettingsSection id="property" title="Property" description="Shown to tenants on their portal and bills.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="property_name" label="Property name" error={errors.property_name?.message}>
            <Input id="property_name" aria-invalid={!!errors.property_name} {...register('property_name')} />
          </FormField>
          <FormField id="property_address" label="Address" error={errors.property_address?.message}>
            <Input id="property_address" {...register('property_address')} />
          </FormField>
          <FormField id="currency_code" label="Currency" error={errors.currency_code?.message}>
            <NativeSelect id="currency_code" {...register('currency_code')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="timezone" label="Timezone" error={errors.timezone?.message} hint="Used for due dates and automatic billing.">
            <NativeSelect id="timezone" {...register('timezone')}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll('_', ' ')}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      </SettingsSection>

      <SettingsSection
        id="billing"
        title="Billing & Utilities"
        description="Bills issue and are due on each agreement's move-in day. Short months use their last calendar day, then return to the original day. The first bill still includes full monthly rent; adjust its draft rent line if you prorate move-in month."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
            <div>
              <Label htmlFor="auto_billing_enabled">Generate bills automatically</Label>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Bills are created when each tenant's monthly anniversary arrives. Meter readings are still required before a bill can be finalized.
              </p>
            </div>
            <Controller
              control={control}
              name="auto_billing_enabled"
              render={({ field }) => (
                <Switch id="auto_billing_enabled" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="reminders"
        title="Rent reminders"
        description="Tenants with portal access are reminded automatically in the app, in your property's timezone. Paid bills are skipped, and part-paid bills show what is still owed."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
            <div>
              <Label htmlFor="rent_reminders_enabled">Send rent reminders</Label>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{reminderSummary}</p>
            </div>
            <Controller
              control={control}
              name="rent_reminders_enabled"
              render={({ field }) => <Switch id="rent_reminders_enabled" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>
          {remindersOn && (
            <>
              <FormField id="reminder_days_before" label="Days before the due date (0 = off)" error={errors.reminder_days_before?.message}>
                <Input id="reminder_days_before" inputMode="numeric" aria-invalid={!!errors.reminder_days_before} {...register('reminder_days_before')} />
              </FormField>
              <FormField id="reminder_days_after" label="Days after, if still unpaid (0 = off)" error={errors.reminder_days_after?.message}>
                <Input id="reminder_days_after" inputMode="numeric" aria-invalid={!!errors.reminder_days_after} {...register('reminder_days_after')} />
              </FormField>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
                <Label htmlFor="reminder_on_due_date">Remind on the due date</Label>
                <Controller
                  control={control}
                  name="reminder_on_due_date"
                  render={({ field }) => <Switch id="reminder_on_due_date" checked={field.value} onCheckedChange={field.onChange} />}
                />
              </div>
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection id="utilities" title="Electricity" description="Electricity remains metered; its configured rate is captured on each bill.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="electricity_rate" label={`Electricity per kWh (${settings.currency_code})`} error={errors.electricity_rate?.message}>
            <Input id="electricity_rate" inputMode="decimal" className="tabular" aria-invalid={!!errors.electricity_rate} {...register('electricity_rate')} />
          </FormField>
        </div>
      </SettingsSection>
    </form>
    <WaterRateSettings currency={settings.currency_code} />
    <form onSubmit={submitSettings} noValidate className="space-y-8 lg:space-y-10">
      <SettingsSection id="payments" title="Payments" description="How tenants can pay. Instructions are shown when they pay, e.g. your bank or e-wallet details.">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="online_payments_enabled">Hosted checkout with PayMongo</Label>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                An optional provider checkout, separate from your transfer accounts below. Requires PayMongo keys on the server.
              </p>
            </div>
            <Controller
              control={control}
              name="online_payments_enabled"
              render={({ field }) => <Switch id="online_payments_enabled" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>
          <div>
            <Label htmlFor="payment_instructions" className="mb-1.5 block">
              Payment instructions
            </Label>
            <Textarea
              id="payment_instructions"
              rows={4}
              placeholder="Add any general instructions for tenants paying by transfer."
              {...register('payment_instructions')}
            />
            {errors.payment_instructions && (
              <p className="mt-1.5 text-[13px] text-destructive">{errors.payment_instructions.message}</p>
            )}
          </div>
        </div>
      </SettingsSection>
    </form>
    <PaymentAccountSettings />
    <form onSubmit={submitSettings} noValidate className="space-y-8 lg:space-y-10">
      <SettingsSection id="tenants" title="Tenant information" description="How tenants can reach you, and the house rules shown on their portal.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField id="contact_name" label="Contact name" error={errors.contact_name?.message}>
            <Input id="contact_name" {...register('contact_name')} />
          </FormField>
          <FormField id="contact_phone" label="Contact phone" error={errors.contact_phone?.message}>
            <Input id="contact_phone" type="tel" aria-invalid={!!errors.contact_phone} {...register('contact_phone')} />
          </FormField>
          <FormField id="contact_email" label="Contact email" error={errors.contact_email?.message}>
            <Input id="contact_email" type="email" aria-invalid={!!errors.contact_email} {...register('contact_email')} />
          </FormField>
          <div className="sm:col-span-3">
            <FormField id="house_rules" label="House rules" error={errors.house_rules?.message}>
              <Textarea id="house_rules" rows={5} {...register('house_rules')} />
            </FormField>
          </div>
        </div>
      </SettingsSection>

      {/* Appears only with unsaved edits; docks above the phone tab bar. */}
      {isDirty && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-[calc(65px+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-2xl border bg-card/95 p-2 pl-4 shadow-lg backdrop-blur-md md:bottom-4"
        >
          <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">Unsaved changes</p>
          <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => reset()}>
            Discard
          </Button>
          <Button type="button" disabled={save.isPending} onClick={() => void submitSettings()}>
            {save.isPending && <Loader2 className="animate-spin" />}
            <span className="sm:hidden">Save</span>
            <span className="hidden sm:inline">Save changes</span>
          </Button>
        </div>
      )}
    </form>
    </div>
  )
}

const waterRateSchema = z.object({
  monthly_rate: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Enter a nonnegative amount with up to two decimal places')
    .transform(Number)
    .refine((v) => Number.isFinite(v) && v <= 9_999_999_999.99, 'Rate exceeds the database limit'),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an effective date'),
})

function WaterRateSettings({ currency }: { currency: string }) {
  const rates = useWaterRateSchedule()
  const save = useSetWaterRate()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<
    z.input<typeof waterRateSchema>,
    unknown,
    z.output<typeof waterRateSchema>
  >({
    resolver: zodResolver(waterRateSchema),
    defaultValues: { monthly_rate: '', effective_from: todayISO() },
  })
  const today = todayISO()
  const currentRate = rates.data?.find((r) => r.effective_from <= today)

  const onSubmit = (value: z.output<typeof waterRateSchema>) =>
    save.mutate(
      { monthlyRate: value.monthly_rate, effectiveFrom: value.effective_from },
      {
        onSuccess: () => {
          toast.success('Water rate scheduled')
          reset({ monthly_rate: '', effective_from: todayISO() })
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <SettingsSection
      id="water-rate"
      title="Per-person water rate"
      description="Water is charged once per rental agreement: billable occupants × the effective monthly rate. Finalized bills keep their applied rate."
    >
      {rates.error && <p role="alert" className="mb-4 text-sm text-destructive">{getErrorMessage(rates.error)}</p>}
      {currentRate && (
        <p className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          Current rate: <strong className="tabular">{formatMoney(currentRate.monthly_rate, currency)}</strong> per person per month
          {currentRate.effective_from !== '1900-01-01' && <> · effective {formatDate(currentRate.effective_from)}</>}
        </p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField id="water-monthly-rate" label={`Monthly rate per person (${currency})`} error={errors.monthly_rate?.message}>
          <Input
            id="water-monthly-rate"
            inputMode="decimal"
            className="tabular"
            aria-invalid={!!errors.monthly_rate}
            {...register('monthly_rate')}
          />
        </FormField>
        <FormField id="water-effective-date" label="Effective date" error={errors.effective_from?.message}>
          <Input
            id="water-effective-date"
            type="date"
            min={today}
            aria-invalid={!!errors.effective_from}
            {...register('effective_from')}
          />
        </FormField>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={save.isPending || rates.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Schedule rate
          </Button>
        </div>
      </form>
      {rates.data && rates.data.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Rate history and upcoming changes</p>
          <ul className="divide-y">
            {rates.data.map((rateEntry) => (
              <li key={rateEntry.id} className="flex justify-between gap-3 py-2 text-sm">
                <span>{formatDate(rateEntry.effective_from)}{rateEntry.effective_from > today ? ' · upcoming' : ''}</span>
                <span className="font-medium tabular">{formatMoney(rateEntry.monthly_rate, currency)} / person</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsSection>
  )
}

const SECTIONS = [
  { id: 'property', label: 'Property' },
  { id: 'billing', label: 'Billing schedule' },
  { id: 'reminders', label: 'Rent reminders' },
  { id: 'utilities', label: 'Utility rates' },
  { id: 'payments', label: 'Payments' },
  { id: 'payment-accounts', label: 'Payment methods' },
  { id: 'tenants', label: 'Tenant information' },
  { id: 'demo-data', label: 'Demo Data' },
]

export function SettingsPage() {
  const { data, isPending, error, refetch } = useSettings()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Property details, billing schedule and utility rates."
        tabs={
          <nav aria-label="Settings sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            {SECTIONS.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="inline-flex h-10 shrink-0 items-center rounded-lg border border-transparent px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:h-8 md:px-3 md:text-[13px]"
              >
                {sec.label}
              </a>
            ))}
          </nav>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <><SettingsForm settings={data} /><DemoDataSection /></>
      )}
    </div>
  )
}
