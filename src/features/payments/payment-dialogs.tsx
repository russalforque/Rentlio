import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Check, CheckCircle2, ChevronRight, HandCoins, Loader2, type LucideIcon, Mail, Phone, Send, Smartphone, X } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { NativeSelect } from '@/components/app/native-select'
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
import { Textarea } from '@/components/ui/textarea'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import type { Enums } from '@/lib/database.types'
import { todayISO } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { dateInput, moneyInput } from '@/lib/form-fields'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'
import { optionalText } from '@/lib/validation'
import {
  METHOD_LABEL,
  useRecordPayment,
  useReviewPayment,
  useSubmitPayment,
  type PaymentOverview,
} from './api'
import { ProofFileInput, ProofPreview } from './components'

const METHODS = Object.entries(METHOD_LABEL) as [Enums<'payment_method'>, string][]

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

// Review --------------------------------------------------------------------------

export function ReviewPaymentDialog({
  payment,
  onOpenChange,
}: {
  payment: PaymentOverview | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!payment} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
        {payment && <ReviewForm key={payment.id} payment={payment} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ReviewForm({ payment, onDone }: { payment: PaymentOverview; onDone: () => void }) {
  const currency = useCurrency()
  const review = useReviewPayment()
  const [mode, setMode] = useState<'review' | 'reject'>('review')
  const [amount, setAmount] = useState(String(payment.amount))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const approve = () => {
    const value = Number(amount.replace(/,/g, ''))
    if (!/^\d+(\.\d{1,2})?$/.test(amount.replace(/,/g, '')) || value <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (value > payment.bill_balance) {
      setError(`The bill's remaining balance is ${formatMoney(payment.bill_balance, currency)}`)
      return
    }
    review.mutate(
      { paymentId: payment.id, approve: true, amount: value === payment.amount ? null : value },
      {
        onSuccess: () => {
          toast.success(`Payment of ${formatMoney(value, currency)} verified`)
          onDone()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  const reject = () => {
    if (!reason.trim()) {
      setError('Tell the tenant why, so they can fix it')
      return
    }
    review.mutate(
      { paymentId: payment.id, approve: false, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Payment rejected. The tenant will see your reason.')
          onDone()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Review payment</DialogTitle>
        <DialogDescription>
          {payment.tenant_name} · Room {payment.room_number} · {formatPeriod(payment.period)} bill
        </DialogDescription>
      </DialogHeader>

      <ProofPreview path={payment.proof_path} />

      <div className="divide-y rounded-lg border px-3">
        <Row label="Amount claimed">
          <span className="tabular">{formatMoney(payment.amount, currency)}</span>
        </Row>
        <Row label="Bill balance">
          <span className="tabular">{formatMoney(payment.bill_balance, currency)}</span>
        </Row>
        <Row label="Method">{METHOD_LABEL[payment.method]}</Row>
        <Row label="Paid on">{formatDate(payment.paid_on)}</Row>
        {payment.reference_number && <Row label="Reference">{payment.reference_number}</Row>}
        {payment.notes && <Row label="Tenant's note">{payment.notes}</Row>}
      </div>

      {mode === 'review' ? (
        <>
          <FormField
            id="verify-amount"
            label="Amount received"
            error={error ?? undefined}
            hint="Change this if the proof shows a different amount. Partial payments are fine."
          >
            <Input
              id="verify-amount"
              inputMode="decimal"
              className="tabular"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError(null)
              }}
            />
          </FormField>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setMode('reject')
                setError(null)
              }}
              disabled={review.isPending}
            >
              <X /> Reject
            </Button>
            <Button onClick={approve} disabled={review.isPending}>
              {review.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Verify payment
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <FormField id="reject-reason" label="Reason for rejecting" error={error ?? undefined}>
            <Textarea
              id="reject-reason"
              rows={3}
              autoFocus
              placeholder="e.g. The screenshot is unreadable, please upload a clearer one."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setError(null)
              }}
            />
          </FormField>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setMode('review')} disabled={review.isPending}>
              Back
            </Button>
            <Button variant="destructive" onClick={reject} disabled={review.isPending}>
              {review.isPending && <Loader2 className="animate-spin" />}
              Reject payment
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  )
}

// Shared payment form (landlord record / tenant submit) ---------------------------

const paymentSchema = (balance: number) =>
  z.object({
    amount: moneyInput('Amount')
      .refine((v) => v > 0, 'Amount must be greater than zero')
      .refine((v) => v <= balance, 'Amount is more than the remaining balance'),
    method: z.enum(['cash', 'bank_transfer', 'gcash', 'maya', 'check', 'other']),
    paid_on: dateInput('payment date').refine((v) => v <= todayISO(), 'The date cannot be in the future'),
    reference: optionalText(100),
    notes: optionalText(1000),
  })
type PaymentInput = z.input<ReturnType<typeof paymentSchema>>
type PaymentOutput = z.output<ReturnType<typeof paymentSchema>>

interface BillRef {
  id: string
  tenant_id: string
  balance: number
  period: string
  room_number: string
}

function PaymentFields({
  form,
  currency,
  balance,
  hideMethod,
}: {
  form: UseFormReturn<PaymentInput, unknown, PaymentOutput>
  currency: string
  balance: number
  /** The caller picks the method with its own control. */
  hideMethod?: boolean
}) {
  const { register, setValue, formState: { errors } } = form
  const dateField = (
    <FormField id="pay-date" label="Date paid" error={errors.paid_on?.message}>
      <Input id="pay-date" type="date" max={todayISO()} aria-invalid={!!errors.paid_on} {...register('paid_on')} />
    </FormField>
  )
  return (
    <>
      <FormField
        id="pay-amount"
        label="Amount"
        error={errors.amount?.message}
        hint={
          <button type="button" className="py-1 underline-offset-2 hover:underline" onClick={() => setValue('amount', String(balance))}>
            Remaining balance: {formatMoney(balance, currency)}
          </button>
        }
      >
        <Input
          id="pay-amount"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          className="text-lg font-semibold tabular md:text-sm"
          aria-invalid={!!errors.amount}
          {...register('amount')}
        />
      </FormField>
      {hideMethod ? (
        dateField
      ) : (
      <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
        <FormField id="pay-method" label="Method">
          <NativeSelect id="pay-method" {...register('method')}>
            {METHODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {dateField}
      </div>
      )}
      <FormField id="pay-ref" label="Reference no. (optional)" error={errors.reference?.message}>
        <Input id="pay-ref" autoComplete="off" enterKeyHint="next" {...register('reference')} />
      </FormField>
      <FormField id="pay-notes" label="Note (optional)" error={errors.notes?.message}>
        <Textarea id="pay-notes" rows={2} {...register('notes')} />
      </FormField>
    </>
  )
}

export function RecordPaymentDialog({
  bill,
  open,
  onOpenChange,
}: {
  bill: BillRef
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-md">
        {open && <RecordForm bill={bill} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function RecordForm({ bill, onDone }: { bill: BillRef; onDone: () => void }) {
  const currency = useCurrency()
  const record = useRecordPayment()
  const [receipt, setReceipt] = useState<File | null>(null)
  const form = useForm<PaymentInput, unknown, PaymentOutput>({
    resolver: zodResolver(paymentSchema(bill.balance)),
    defaultValues: { amount: String(bill.balance), method: 'cash', paid_on: todayISO(), reference: '', notes: '' },
  })

  const onSubmit = (v: PaymentOutput) =>
    record.mutate(
      {
        billId: bill.id,
        tenantId: bill.tenant_id,
        amount: v.amount,
        method: v.method,
        paidOn: v.paid_on,
        reference: v.reference,
        notes: v.notes,
        receipt,
      },
      {
        onSuccess: () => {
          toast.success(`Payment of ${formatMoney(v.amount, currency)} recorded`)
          onDone()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Record a payment</DialogTitle>
        <DialogDescription>
          For money you received directly, e.g. cash. It counts as verified immediately.
        </DialogDescription>
      </DialogHeader>
      <PaymentFields form={form} currency={currency} balance={bill.balance} />
      <ProofFileInput file={receipt} onChange={setReceipt} />
      <DialogFooter>
        <Button type="submit" disabled={record.isPending}>
          {record.isPending && <Loader2 className="animate-spin" />}
          Record payment
        </Button>
      </DialogFooter>
    </form>
  )
}

export function SubmitPaymentDialog({
  bill,
  open,
  onOpenChange,
}: {
  bill: BillRef
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
        {open && <SubmitForm bill={bill} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** Methods a tenant can pay with remotely and prove with a screenshot. */
const ONLINE_METHODS: { value: Enums<'payment_method'>; label: string; note: string }[] = [
  { value: 'gcash', label: 'GCash', note: 'E-wallet' },
  { value: 'maya', label: 'Maya', note: 'E-wallet' },
  { value: 'bank_transfer', label: 'Bank transfer', note: 'Online or OTC' },
  { value: 'other', label: 'Other', note: 'Any other way' },
]

type Step = 'choose' | 'online' | 'in-person' | 'sent'

/** Where the tenant is in the flow: shown as a small "Step 1 of 2" line. */
function StepLabel({ n, of }: { n: number; of: number }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      Step {n} of {of}
    </p>
  )
}

function AmountSummary({ bill, currency }: { bill: BillRef; currency: string }) {
  return (
    <div className="flex items-end justify-between gap-3 rounded-xl bg-muted/70 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Balance due · {formatPeriod(bill.period)}</p>
        <p className="font-display mt-1 truncate text-2xl leading-none font-semibold tabular">{formatMoney(bill.balance, currency)}</p>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">Room {bill.room_number}</p>
    </div>
  )
}

function SubmitForm({ bill, onDone }: { bill: BillRef; onDone: () => void }) {
  const currency = useCurrency()
  const { data: settings } = useSettings()
  const submit = useSubmitPayment()
  const [step, setStep] = useState<Step>('choose')
  const [sentAmount, setSentAmount] = useState(0)
  const [proof, setProof] = useState<File | null>(null)
  const [proofError, setProofError] = useState<string | undefined>()
  const form = useForm<PaymentInput, unknown, PaymentOutput>({
    resolver: zodResolver(paymentSchema(bill.balance)),
    defaultValues: { amount: String(bill.balance), method: 'gcash', paid_on: todayISO(), reference: '', notes: '' },
  })
  const method = useWatch({ control: form.control, name: 'method' })

  const onSubmit = (v: PaymentOutput) => {
    if (!proof) {
      setProofError('Attach a screenshot or photo of your payment')
      return
    }
    submit.mutate(
      {
        billId: bill.id,
        tenantId: bill.tenant_id,
        amount: v.amount,
        method: v.method,
        paidOn: v.paid_on,
        reference: v.reference,
        notes: v.notes,
        proof,
      },
      {
        onSuccess: () => {
          toast.success('Payment sent. Your landlord will verify it soon.')
          setSentAmount(v.amount)
          setStep('sent')
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  if (step === 'sent') {
    return (
      <div role="status" className="flex flex-col items-center py-4 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-success/12 text-success">
          <CheckCircle2 className="size-8" aria-hidden />
        </span>
        <DialogTitle className="mt-5">Payment sent</DialogTitle>
        <DialogDescription className="mt-2 max-w-xs">
          We sent your proof of <b className="text-foreground tabular">{formatMoney(sentAmount, currency)}</b> to your landlord. It
          shows as <b className="text-foreground">Awaiting verification</b> until they confirm it.
        </DialogDescription>
        <Button size="lg" className="mt-6 w-full sm:w-auto" onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }

  if (step === 'choose') {
    return (
      <div className="grid gap-5">
        <DialogHeader>
          <StepLabel n={1} of={2} />
          <DialogTitle>Pay {formatPeriod(bill.period)} bill</DialogTitle>
          <DialogDescription>Choose how you'd like to pay. You can pay part now and the rest later.</DialogDescription>
        </DialogHeader>
        <AmountSummary bill={bill} currency={currency} />
        <div className="grid gap-3" role="list">
          <ChoiceCard
            icon={Smartphone}
            title="Pay online"
            note="GCash, Maya or bank transfer, then upload a screenshot as proof."
            onClick={() => setStep('online')}
          />
          <ChoiceCard
            icon={HandCoins}
            title="Pay in person"
            note="Hand cash to your landlord. They record it for you."
            onClick={() => setStep('in-person')}
          />
        </div>
      </div>
    )
  }

  if (step === 'in-person') {
    return (
      <div className="grid gap-5">
        <DialogHeader>
          <StepLabel n={2} of={2} />
          <DialogTitle>Pay in person</DialogTitle>
          <DialogDescription>
            Give the payment to your landlord and ask for a receipt. Once they record it, it appears in your payment history
            and your balance updates.
          </DialogDescription>
        </DialogHeader>
        <AmountSummary bill={bill} currency={currency} />
        {(settings?.contact_name || settings?.contact_phone || settings?.contact_email) && (
          <div className="rounded-xl border p-4">
            <p className="text-xs font-medium text-muted-foreground">Your landlord</p>
            {settings.contact_name && <p className="mt-1 text-[15px] font-semibold">{settings.contact_name}</p>}
            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
              {settings.contact_phone && (
                <Button variant="outline" asChild>
                  <a href={`tel:${settings.contact_phone}`}>
                    <Phone /> Call {settings.contact_phone}
                  </a>
                </Button>
              )}
              {settings.contact_email && (
                <Button variant="outline" asChild>
                  <a href={`mailto:${settings.contact_email}`}>
                    <Mail /> Email
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="flex-row">
          <Button variant="outline" onClick={() => setStep('choose')}>
            <ArrowLeft /> Back
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={onDone}>
            Got it
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <DialogHeader>
        <StepLabel n={2} of={2} />
        <DialogTitle>Pay online</DialogTitle>
        <DialogDescription>Send the payment with your app, then tell us what you sent and attach the proof.</DialogDescription>
      </DialogHeader>
      <AmountSummary bill={bill} currency={currency} />

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Payment method</legend>
        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
          {ONLINE_METHODS.map((m) => {
            const active = method === m.value
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => form.setValue('method', m.value, { shouldDirty: true })}
                className={cn(
                  'flex min-h-16 flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'hover:border-foreground/25',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2 text-[15px] font-semibold md:text-sm">
                  {m.label}
                  {active && <Check className="size-4 shrink-0" aria-hidden />}
                </span>
                <span className="text-xs text-muted-foreground">{m.note}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {settings?.payment_instructions && (
        <div className="rounded-xl border bg-accent/50 p-4 text-sm">
          <p className="mb-1 font-semibold">Where to send it</p>
          <p className="whitespace-pre-line text-muted-foreground">{settings.payment_instructions}</p>
        </div>
      )}
      <PaymentFields form={form} currency={currency} balance={bill.balance} hideMethod />
      <ProofFileInput
        file={proof}
        required
        error={proofError}
        onChange={(f) => {
          setProof(f)
          setProofError(undefined)
        }}
      />
      <DialogFooter className="flex-row">
        <Button type="button" variant="outline" onClick={() => setStep('choose')} disabled={submit.isPending} aria-label="Back">
          <ArrowLeft /> <span className="hidden sm:inline">Back</span>
        </Button>
        <Button type="submit" className="flex-1 sm:flex-none" disabled={submit.isPending}>
          {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          {submit.isPending ? 'Sending…' : 'Submit payment'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ChoiceCard({ icon: Icon, title, note, onClick }: { icon: LucideIcon; title: string; note: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="listitem"
      onClick={onClick}
      className="group flex min-h-20 items-center gap-4 rounded-2xl border p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{note}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}
