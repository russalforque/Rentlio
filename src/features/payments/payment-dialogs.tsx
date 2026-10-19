import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Copy, Download, ExternalLink, HandCoins, Loader2, Lock, type LucideIcon, Mail, Phone, Send, ShieldCheck, Smartphone, X } from 'lucide-react'
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
import { todayISO } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { dateInput, moneyInput } from '@/lib/form-fields'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { STORAGE_BUCKETS, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { optionalText } from '@/lib/validation'
import {
  MANUAL_METHODS,
  METHOD_LABEL,
  usePaymentAccounts,
  usePaymentQrUrl,
  useRecordPayment,
  useReviewPayment,
  useStartOnlinePayment,
  useSubmitQrPayment,
  type PaymentAccount,
  type PaymentOverview,
} from './api'
import { ProofFileInput, ProofPreview } from './components'

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
  const accounts = usePaymentAccounts()
  const [mode, setMode] = useState<'review' | 'reject'>('review')
  const [amount, setAmount] = useState(String(payment.amount))
  const [reason, setReason] = useState('')
  const [moneyReceived, setMoneyReceived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const receivingAccount = accounts.data?.find((a) => a.id === payment.payment_account_id)
  const receivingAccountDetails = payment.payment_account_snapshot
    ?? (receivingAccount
      ? {
          method: receivingAccount.method,
          account_holder: receivingAccount.account_holder,
          account_number: receivingAccount.account_number,
          bank_name: receivingAccount.bank_name,
        }
      : null)

  const approve = () => {
    if (!moneyReceived) {
      setError('Confirm that the money reached the corresponding account before approving.')
      return
    }
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
      { paymentId: payment.id, approve: true, amount: value === payment.amount ? null : value, moneyReceived: true },
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
      { paymentId: payment.id, approve: false, reason: reason.trim(), moneyReceived: false },
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
      {receivingAccountDetails && (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-semibold">Receiving account selected by tenant</p>
          <p className="mt-1 text-muted-foreground">
            {METHOD_LABEL[receivingAccountDetails.method]} · {receivingAccountDetails.account_holder} · {receivingAccountDetails.account_number}
            {receivingAccountDetails.bank_name ? ` · ${receivingAccountDetails.bank_name}` : ''}
          </p>
        </div>
      )}

      {mode === 'review' ? (
        <>
          <label className="flex min-h-12 items-start gap-3 rounded-xl border px-3 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={moneyReceived}
              onChange={(e) => {
                setMoneyReceived(e.target.checked)
                setError(null)
              }}
            />
            <span>I confirmed the money was actually received in the corresponding GCash, Maya, or bank account.</span>
          </label>
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
            <Button onClick={approve} disabled={review.isPending || !moneyReceived}>
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
  rent_amount?: number
  electricity_amount?: number
  water_amount?: number
  other_amount?: number
  /** Sent by the tenant, not yet verified: it cannot be paid twice. */
  pending_amount?: number
}

function PaymentFields({
  form,
  currency,
  balance,
  hideMethod,
  amountReadOnly = false,
}: {
  form: UseFormReturn<PaymentInput, unknown, PaymentOutput>
  currency: string
  balance: number
  /** The caller picks the method with its own control. */
  hideMethod?: boolean
  amountReadOnly?: boolean
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
        label={amountReadOnly ? 'Amount to pay' : 'Amount'}
        error={errors.amount?.message}
        hint={amountReadOnly ? (
          'This is your remaining balance, less payments awaiting verification.'
        ) : (
          <button type="button" className="py-1 underline-offset-2 hover:underline" onClick={() => setValue('amount', String(balance))}>
            Remaining balance: {formatMoney(balance, currency)}
          </button>
        )}
      >
        <Input
          id="pay-amount"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          className="text-lg font-semibold tabular md:text-sm"
          aria-invalid={!!errors.amount}
          {...register('amount')}
          readOnly={amountReadOnly}
          aria-readonly={amountReadOnly}
        />
      </FormField>
      {hideMethod ? (
        dateField
      ) : (
      <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
        <FormField id="pay-method" label="Method">
          <NativeSelect id="pay-method" {...register('method')}>
            {MANUAL_METHODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {dateField}
      </div>
      )}
      <FormField id="pay-ref" label="Transaction reference (optional)" error={errors.reference?.message}>
        <Input id="pay-ref" autoComplete="off" enterKeyHint="next" placeholder="Enter if shown on your receipt; otherwise leave blank" {...register('reference')} />
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
  // One per dialog: a double click or a retry after a lost response records the payment once.
  const [requestId] = useState(() => crypto.randomUUID())
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
        requestId,
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
      <DialogContent className="tenant-dialog max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        {open && <SubmitForm bill={bill} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** Transfer payments guide tenants through account selection, transfer, and proof submission. */
type Step = 'choose' | 'online' | 'transfer' | 'proof' | 'in-person' | 'sent'

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

function BillChargeSummary({ bill, currency }: { bill: BillRef; currency: string }) {
  const rows = [
    ['Rent', bill.rent_amount],
    ['Electricity', bill.electricity_amount],
    ['Water', bill.water_amount],
    ['Additional charges', bill.other_amount],
  ] as const
  if (rows.every(([, amount]) => amount === undefined)) return null
  return (
    <div className="rounded-xl border px-4 py-3">
      <p className="mb-2 text-sm font-semibold">Bill charges</p>
      <dl className="grid gap-1.5 text-sm">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular">{formatMoney(amount ?? 0, currency)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function TransferAccountDetails({ account, instructions }: { account: PaymentAccount; instructions?: string | null }) {
  const { data: qrUrl, isPending, error } = usePaymentQrUrl(account.qr_path)
  const [isDownloading, setIsDownloading] = useState(false)
  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(account.account_number)
      toast.success('Account number copied')
    } catch {
      toast.error('Could not copy the account number. Please select and copy it manually.')
    }
  }
  const downloadQr = async () => {
    setIsDownloading(true)
    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKETS.paymentQrCodes).download(account.qr_path)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `payment-qr-${account.method}.${account.qr_path.split('.').pop() ?? 'png'}`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      toast.error(`Could not download the QR code. ${getErrorMessage(error)}`)
    } finally {
      setIsDownloading(false)
    }
  }
  return (
    <div className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] sm:gap-6 sm:p-5">
      <div className="min-w-0 self-center">
        <p className="text-xs font-medium text-muted-foreground">Send your transfer to</p>
        <p className="mt-1 text-base font-semibold">{account.account_holder}</p>
        {account.bank_name && <p className="mt-0.5 text-sm text-muted-foreground">{account.bank_name}</p>}
        <div className="mt-4 rounded-xl bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">Account number</p>
          <p className="mt-1 break-all text-lg font-semibold tabular">{account.account_number}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3 min-h-10" onClick={() => void copyAccount()}>
            <Copy /> Copy account number
          </Button>
        </div>
      </div>
      <div className="grid content-start gap-2">
        <p className="text-center text-xs font-medium text-muted-foreground">Scan this QR code to pay</p>
        <div className="mx-auto grid aspect-square w-full max-w-64 place-items-center rounded-xl bg-white p-2 sm:max-w-none">
          {isPending ? (
            <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
          ) : error || !qrUrl ? (
            <p role="alert" className="grid aspect-square w-full place-items-center rounded-lg bg-muted p-3 text-center text-xs text-destructive">
              Could not load the QR image. You can still use the account number.
            </p>
          ) : (
            <img src={qrUrl} alt={`${METHOD_LABEL[account.method]} payment QR code`} className="aspect-square w-full object-contain" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" className="w-full" disabled={!qrUrl || isPending || !!error || isDownloading} onClick={() => void downloadQr()}>
            <Download /> {isDownloading ? 'Downloading…' : 'Download'}
          </Button>
          {qrUrl && !isPending && !error ? (
            <Button asChild variant="ghost" size="sm" className="w-full">
              <a href={qrUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> View
              </a>
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="w-full" disabled>
              <ExternalLink /> View
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-xl border bg-muted/20 p-3 text-sm sm:col-span-2">
        <p className="font-semibold">Payment instructions</p>
        <p className="mt-1 whitespace-pre-line text-muted-foreground">
          {instructions?.trim() || 'No additional instructions from your landlord.'}
        </p>
      </div>
    </div>
  )
}

/** Hosted checkout at the payment provider. The payment is recorded when the provider confirms it, not here. */
function OnlineCheckout({ bill, owed, currency, onBack, onUseProof }: {
  bill: BillRef
  owed: number
  currency: string
  onBack: () => void
  onUseProof: () => void
}) {
  const start = useStartOnlinePayment()
  const [amount, setAmount] = useState(String(owed))
  const [error, setError] = useState<string | null>(null)

  const go = () => {
    const raw = amount.replace(/,/g, '').trim()
    const value = Number(raw)
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || value <= 0) return setError('Enter a valid amount')
    if (value > owed) return setError(`You owe ${formatMoney(owed, currency)} on this bill`)
    start.mutate(
      { billId: bill.id, amount: value },
      {
        // Leaves the app; the provider sends the tenant back to this bill afterwards.
        onSuccess: ({ checkout_url }) => window.location.assign(checkout_url),
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <StepLabel n={2} of={2} />
        <DialogTitle>Pay online</DialogTitle>
        <DialogDescription>
          You'll finish on a secure payment page. Your bill updates on its own once the payment goes through.
        </DialogDescription>
      </DialogHeader>
      <AmountSummary bill={bill} currency={currency} />
      <FormField
        id="online-amount"
        label="Amount to pay"
        error={error ?? undefined}
        hint={
          <button type="button" className="py-1 underline-offset-2 hover:underline" onClick={() => (setAmount(String(owed)), setError(null))}>
            Pay the full {formatMoney(owed, currency)}
          </button>
        }
      >
        <Input
          id="online-amount"
          inputMode="decimal"
          autoComplete="off"
          className="text-lg font-semibold tabular md:text-sm"
          value={amount}
          aria-invalid={!!error}
          onChange={(e) => (setAmount(e.target.value), setError(null))}
        />
      </FormField>
      <ul className="flex flex-wrap gap-1.5" aria-label="Accepted payment methods">
        {['GCash', 'Maya', 'Card', 'QR Ph'].map((m) => (
          <li key={m} className="rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
            {m}
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
        Payments are processed by PayMongo. Rentlio never sees your card or wallet details.
      </p>
      <DialogFooter className="flex-row">
        <Button type="button" variant="outline" onClick={onBack} disabled={start.isPending} aria-label="Back">
          <ArrowLeft /> <span className="hidden sm:inline">Back</span>
        </Button>
        <Button className="flex-1 sm:flex-none" onClick={go} disabled={start.isPending}>
          {start.isPending ? <Loader2 className="animate-spin" /> : <Lock />}
          {start.isPending ? 'Opening checkout…' : 'Continue to payment'}
        </Button>
      </DialogFooter>
      <button type="button" onClick={onUseProof} className="-mt-2 text-center text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        Already paid by bank transfer? Upload proof instead
      </button>
    </div>
  )
}

function SubmitForm({ bill, onDone }: { bill: BillRef; onDone: () => void }) {
  const currency = useCurrency()
  const { data: settings } = useSettings()
  const paymentAccounts = usePaymentAccounts()
  const submit = useSubmitQrPayment()
  const [requestId] = useState(() => crypto.randomUUID())
  const [step, setStep] = useState<Step>('choose')
  const [sentAmount, setSentAmount] = useState(0)
  const [proof, setProof] = useState<File | null>(null)
  const [proofError, setProofError] = useState<string | undefined>()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  // Payments already sent and waiting for verification cannot be paid again.
  const owed = Math.max(0, Math.round((bill.balance - (bill.pending_amount ?? 0)) * 100) / 100)
  const onlineEnabled = !!settings?.online_payments_enabled
  const form = useForm<PaymentInput, unknown, PaymentOutput>({
    resolver: zodResolver(paymentSchema(owed)),
    defaultValues: { amount: String(owed), method: 'gcash', paid_on: todayISO(), reference: '', notes: '' },
  })
  const activeAccounts = (paymentAccounts.data ?? []).filter((account) => account.is_active)
  const selectedAccount =
    activeAccounts.find((account) => account.id === selectedAccountId)
    ?? activeAccounts.find((account) => account.is_default)
    ?? activeAccounts[0]

  const onSubmit = (v: PaymentOutput) => {
    const reference = v.reference?.trim() ?? ''
    if (reference && (reference.length < 3 || !/^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,99}$/.test(reference))) {
      form.setError('reference', { message: 'Use 3 to 100 letters, numbers, spaces, or . _ / -' })
      return
    }
    if (!selectedAccount) {
      setProofError('No active payment account is available. Please contact your landlord.')
      return
    }
    if (!proof) {
      setProofError('Attach a screenshot or photo of your payment.')
      return
    }
    submit.mutate(
      {
        accountId: selectedAccount.id,
        billId: bill.id,
        tenantId: bill.tenant_id,
        amount: v.amount,
        paidOn: v.paid_on,
        reference,
        notes: v.notes,
        proof,
        requestId,
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
          shows as <b className="text-foreground">Pending verification</b> until they confirm it.
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
          <StepLabel n={1} of={3} />
          <DialogTitle>Pay {formatPeriod(bill.period)} bill</DialogTitle>
          <DialogDescription>Choose how you'd like to pay. You can pay part now and the rest later.</DialogDescription>
        </DialogHeader>
        <AmountSummary bill={bill} currency={currency} />
        {owed < bill.balance && (
          <p className="-mt-2 text-[13px] text-muted-foreground">
            {formatMoney(bill.balance - owed, currency)} you sent is waiting for verification, so{' '}
            <b className="text-foreground tabular">{formatMoney(owed, currency)}</b> is left to pay.
          </p>
        )}
        <div className="grid gap-3" role="list">
          <ChoiceCard
            icon={Smartphone}
            title="Bank transfer or e-wallet"
            note={activeAccounts.length ? 'Choose an account, make your transfer, then submit the reference and proof.' : 'No active transfer accounts are available yet.'}
            onClick={() => setStep('transfer')}
          />
          {onlineEnabled && (
            <ChoiceCard
              icon={Lock}
              title="Pay with PayMongo"
              note="Continue to a secure provider checkout. Confirmation comes from the provider."
              onClick={() => setStep('online')}
            />
          )}
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

  if (step === 'online') {
    return (
      <OnlineCheckout
        bill={bill}
        owed={owed}
        currency={currency}
        onBack={() => setStep('choose')}
        onUseProof={() => setStep('proof')}
      />
    )
  }

  if (step === 'transfer') {
    return (
      <div className="grid gap-5">
        <DialogHeader>
          <StepLabel n={2} of={3} />
          <DialogTitle>Make your transfer</DialogTitle>
          <DialogDescription>
            Choose a payment account, then send the amount shown using your banking or wallet app.
          </DialogDescription>
        </DialogHeader>
        <AmountSummary bill={bill} currency={currency} />
        <BillChargeSummary bill={bill} currency={currency} />

        {paymentAccounts.error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">
            Could not load payment accounts. Retry the bill page before making a transfer.
          </div>
        ) : paymentAccounts.isPending ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : activeAccounts.length ? (
          <>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Choose a payment account</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {activeAccounts.map((account) => {
                  const active = selectedAccount?.id === account.id
                  return (
                    <label
                      key={account.id}
                      className={cn(
                        'flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                        active ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'hover:border-foreground/25',
                      )}
                    >
                      <input
                        type="radio"
                        name="payment-account"
                        value={account.id}
                        checked={active}
                        onChange={() => setSelectedAccountId(account.id)}
                        className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          {METHOD_LABEL[account.method]}
                          {account.is_default && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Default</span>}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{account.account_holder}</span>
                        <span className="mt-0.5 block break-all text-xs tabular text-muted-foreground">
                          {account.bank_name ? `${account.bank_name} · ` : ''}{account.account_number}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            {selectedAccount && (
              <TransferAccountDetails
                key={selectedAccount.id}
                account={selectedAccount}
                instructions={settings?.payment_instructions}
              />
            )}
            <div className="rounded-xl border bg-accent/50 p-4 text-sm">
              <p className="mb-1 font-semibold">Before you continue</p>
              <p className="text-muted-foreground">
                Complete the transfer in your wallet or banking app. The QR code provides payment details only; it does not send money or confirm payment.
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Your landlord has not configured an active transfer account. Please contact them before sending money.
          </div>
        )}

        <DialogFooter className="flex-row">
          <Button type="button" variant="outline" onClick={() => setStep('choose')}>
            <ArrowLeft /> Back
          </Button>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            onClick={() => setStep('proof')}
            disabled={paymentAccounts.isPending || !!paymentAccounts.error || !selectedAccount}
          >
            I’ve made the transfer <ChevronRight />
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <DialogHeader>
        <StepLabel n={3} of={3} />
        <DialogTitle>Submit payment proof</DialogTitle>
        <DialogDescription>Enter the transaction details and upload proof so your landlord can verify the transfer.</DialogDescription>
      </DialogHeader>
      <AmountSummary bill={bill} currency={currency} />
      {selectedAccount && (
        <div className="rounded-xl border bg-muted/30 px-3 py-2.5 text-sm">
          <p className="text-xs text-muted-foreground">Submitting proof for</p>
          <p className="mt-1 font-medium">
            {METHOD_LABEL[selectedAccount.method]} · {selectedAccount.account_holder}
          </p>
          <p className="mt-0.5 break-all text-xs tabular text-muted-foreground">
            {selectedAccount.bank_name ? `${selectedAccount.bank_name} · ` : ''}{selectedAccount.account_number}
          </p>
        </div>
      )}

      <PaymentFields form={form} currency={currency} balance={owed} hideMethod amountReadOnly />
      <ProofFileInput
        file={proof}
        required
        imagesOnly
        error={proofError}
        onChange={(f) => {
          setProof(f)
          setProofError(undefined)
        }}
      />
      <DialogFooter className="flex-row">
        <Button type="button" variant="outline" onClick={() => setStep('transfer')} disabled={submit.isPending} aria-label="Back">
          <ArrowLeft /> <span className="hidden sm:inline">Back</span>
        </Button>
        <Button type="submit" className="flex-1 sm:flex-none" disabled={submit.isPending || !selectedAccount}>
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
