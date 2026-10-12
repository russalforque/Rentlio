import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { NativeSelect } from '@/components/app/native-select'
import { PageHeader } from '@/components/app/page-header'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { settingsQueryKey, useSettings } from '@/hooks/use-settings'
import type { Tables } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/errors'
import { intInput } from '@/lib/form-fields'
import { supabase } from '@/lib/supabase'
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
  billing_day: intInput(1, 28),
  due_days: intInput(0, 60),
  electricity_rate: rate('electricity rate'),
  water_billing_mode: z.enum(['metered', 'flat']),
  water_rate: rate('water rate'),
  water_flat_fee: rate('flat water fee'),
  auto_billing_enabled: z.boolean(),
  payment_instructions: optionalText(2000),
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
    billing_day: String(s.billing_day),
    due_days: String(s.due_days),
    electricity_rate: String(s.electricity_rate),
    water_billing_mode: s.water_billing_mode,
    water_rate: String(s.water_rate),
    water_flat_fee: String(s.water_flat_fee),
    auto_billing_enabled: s.auto_billing_enabled,
    payment_instructions: s.payment_instructions ?? '',
    contact_name: s.contact_name ?? '',
    contact_phone: s.contact_phone ?? '',
    contact_email: s.contact_email ?? '',
    house_rules: s.house_rules ?? '',
  }
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th')
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

  const waterMode = useWatch({ control, name: 'water_billing_mode' })
  const billingDay = Number(useWatch({ control, name: 'billing_day' })) || 1
  const dueDays = Number(useWatch({ control, name: 'due_days' })) || 0

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Property</CardTitle>
          <CardDescription>Shown to tenants on their portal and bills.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing schedule</CardTitle>
          <CardDescription>
            Bills are issued on the {ordinal(billingDay)} of each month and due {dueDays}{' '}
            {dueDays === 1 ? 'day' : 'days'} later.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="billing_day" label="Billing day of month (1–28)" error={errors.billing_day?.message}>
            <Input id="billing_day" inputMode="numeric" aria-invalid={!!errors.billing_day} {...register('billing_day')} />
          </FormField>
          <FormField id="due_days" label="Days until due" error={errors.due_days?.message}>
            <Input id="due_days" inputMode="numeric" aria-invalid={!!errors.due_days} {...register('due_days')} />
          </FormField>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
            <div>
              <Label htmlFor="auto_billing_enabled">Generate bills automatically</Label>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                On the billing day, every occupied room gets its bill. You can always generate manually too.
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Utility rates</CardTitle>
          <CardDescription>
            A rate is locked into each bill when the charge is first added, so changing it does not alter past bills.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="electricity_rate" label={`Electricity per kWh (${settings.currency_code})`} error={errors.electricity_rate?.message}>
            <Input id="electricity_rate" inputMode="decimal" className="tabular" aria-invalid={!!errors.electricity_rate} {...register('electricity_rate')} />
          </FormField>
          <FormField id="water_billing_mode" label="Water billing">
            <NativeSelect id="water_billing_mode" {...register('water_billing_mode')}>
              <option value="metered">Metered (per m³)</option>
              <option value="flat">Flat fee per room</option>
            </NativeSelect>
          </FormField>
          {waterMode === 'metered' ? (
            <FormField id="water_rate" label={`Water per m³ (${settings.currency_code})`} error={errors.water_rate?.message}>
              <Input id="water_rate" inputMode="decimal" className="tabular" aria-invalid={!!errors.water_rate} {...register('water_rate')} />
            </FormField>
          ) : (
            <FormField id="water_flat_fee" label={`Monthly water fee (${settings.currency_code})`} error={errors.water_flat_fee?.message}>
              <Input id="water_flat_fee" inputMode="decimal" className="tabular" aria-invalid={!!errors.water_flat_fee} {...register('water_flat_fee')} />
            </FormField>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment instructions</CardTitle>
          <CardDescription>Shown to tenants when they pay, e.g. your bank or e-wallet details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="payment_instructions"
            aria-label="Payment instructions"
            rows={4}
            placeholder={'GCash: 0917 000 0000 (Juan D.)\nBPI: 1234-5678-90'}
            {...register('payment_instructions')}
          />
          {errors.payment_instructions && (
            <p className="mt-1.5 text-[13px] text-destructive">{errors.payment_instructions.message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant information</CardTitle>
          <CardDescription>How tenants can reach you, and the house rules shown on their portal.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        </CardContent>
      </Card>

      <div className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 -mx-4 flex justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 [&>*]:flex-1 sm:[&>*]:flex-none">
        <Button type="button" variant="ghost" disabled={!isDirty || save.isPending} onClick={() => reset()}>
          Discard
        </Button>
        <Button type="submit" disabled={!isDirty || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  )
}

export function SettingsPage() {
  const { data, isPending, error, refetch } = useSettings()
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Property details, billing schedule and utility rates." />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <SettingsForm settings={data} />
      )}
    </div>
  )
}
