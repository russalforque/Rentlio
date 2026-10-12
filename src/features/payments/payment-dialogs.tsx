import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
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
}: {
  form: UseFormReturn<PaymentInput, unknown, PaymentOutput>
  currency: string
  balance: number
}) {
  const { register, setValue, formState: { errors } } = form
  return (
    <>
      <FormField
        id="pay-amount"
        label="Amount"
        error={errors.amount?.message}
        hint={
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setValue('amount', String(balance))}>
            Remaining balance: {formatMoney(balance, currency)}
          </button>
        }
      >
        <Input id="pay-amount" inputMode="decimal" className="tabular" aria-invalid={!!errors.amount} {...register('amount')} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="pay-method" label="Method">
          <NativeSelect id="pay-method" {...register('method')}>
            {METHODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="pay-date" label="Date paid" error={errors.paid_on?.message}>
          <Input id="pay-date" type="date" max={todayISO()} aria-invalid={!!errors.paid_on} {...register('paid_on')} />
        </FormField>
      </div>
      <FormField id="pay-ref" label="Reference no. (optional)" error={errors.reference?.message}>
        <Input id="pay-ref" {...register('reference')} />
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
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-md">
        {open && <SubmitForm bill={bill} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function SubmitForm({ bill, onDone }: { bill: BillRef; onDone: () => void }) {
  const currency = useCurrency()
  const { data: settings } = useSettings()
  const submit = useSubmitPayment()
  const [proof, setProof] = useState<File | null>(null)
  const [proofError, setProofError] = useState<string | undefined>()
  const form = useForm<PaymentInput, unknown, PaymentOutput>({
    resolver: zodResolver(paymentSchema(bill.balance)),
    defaultValues: { amount: String(bill.balance), method: 'gcash', paid_on: todayISO(), reference: '', notes: '' },
  })

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
          onDone()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Pay {formatPeriod(bill.period)} bill</DialogTitle>
        <DialogDescription>
          Pay using your usual method, then upload the proof here. You can pay part of the bill now and the rest later.
        </DialogDescription>
      </DialogHeader>
      {settings?.payment_instructions && (
        <div className="rounded-lg border bg-accent/50 p-3 text-sm">
          <p className="mb-1 font-semibold">How to pay</p>
          <p className="whitespace-pre-line text-muted-foreground">{settings.payment_instructions}</p>
        </div>
      )}
      <PaymentFields form={form} currency={currency} balance={bill.balance} />
      <ProofFileInput
        file={proof}
        required
        error={proofError}
        onChange={(f) => {
          setProof(f)
          setProofError(undefined)
        }}
      />
      <DialogFooter>
        <Button type="submit" disabled={submit.isPending} className="w-full sm:w-auto">
          {submit.isPending && <Loader2 className="animate-spin" />}
          Submit payment
        </Button>
      </DialogFooter>
    </form>
  )
}
