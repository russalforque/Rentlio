import { zodResolver } from '@hookform/resolvers/zod'
import { Ban, Eye, Gauge, Loader2, MoreHorizontal, Plus, ReceiptText, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/app/confirm-dialog'
import { FormField } from '@/components/app/form-field'
import { Callout, Meter, Panel } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  useAddCharge,
  useBill,
  useBillItems,
  useRemoveCharge,
  useUpdateBillItem,
  useVoidBill,
} from '@/features/billing/api'
import { BillItems } from '@/features/billing/bill-items'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { METHOD_LABEL, useBillPayments, type PaymentOverview } from '@/features/payments/api'
import { PaymentStatusBadge, ProofPreview } from '@/features/payments/components'
import { RecordPaymentDialog, ReviewPaymentDialog } from '@/features/payments/payment-dialogs'
import { useCurrency } from '@/hooks/use-settings'
import type { Tables } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/errors'
import { moneyInput } from '@/lib/form-fields'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

// Charge add/edit --------------------------------------------------------------------

const chargeSchema = z.object({
  description: z.string().trim().min(1, 'Describe the charge').max(200),
  amount: moneyInput('Amount'),
})

function ChargeDialog({
  billId,
  item,
  onClose,
}: {
  billId: string
  /** Undefined = add a new extra charge. */
  item?: Tables<'bill_items'>
  onClose: () => void
}) {
  const add = useAddCharge()
  const update = useUpdateBillItem()
  const pending = add.isPending || update.isPending
  const { register, handleSubmit, formState: { errors } } = useForm<
    z.input<typeof chargeSchema>,
    unknown,
    z.output<typeof chargeSchema>
  >({
    resolver: zodResolver(chargeSchema),
    defaultValues: { description: item?.description ?? '', amount: item ? String(item.amount) : '' },
  })

  const onSubmit = (v: z.output<typeof chargeSchema>) => {
    const done = {
      onSuccess: () => {
        toast.success(item ? 'Charge updated' : 'Charge added')
        onClose()
      },
      onError: (err: unknown) => toast.error(getErrorMessage(err)),
    }
    if (item) update.mutate({ itemId: item.id, description: v.description, amount: v.amount }, done)
    else if (v.amount <= 0) toast.error('Amount must be greater than zero')
    else add.mutate({ billId, description: v.description, amount: v.amount }, done)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{item ? (item.kind === 'rent' ? 'Adjust rent' : 'Edit charge') : 'Add a charge'}</DialogTitle>
            <DialogDescription>
              {item?.kind === 'rent'
                ? 'For example, to pro-rate a move-in month. This changes only this bill.'
                : 'Extra one-off charges such as repairs or a replacement key.'}
            </DialogDescription>
          </DialogHeader>
          <FormField id="charge-desc" label="Description" error={errors.description?.message}>
            <Input id="charge-desc" aria-invalid={!!errors.description} {...register('description')} />
          </FormField>
          <FormField id="charge-amount" label="Amount" error={errors.amount?.message}>
            <Input id="charge-amount" inputMode="decimal" className="tabular" aria-invalid={!!errors.amount} {...register('amount')} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {item ? 'Save' : 'Add charge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function VoidDialog({ billId, onClose }: { billId: string; onClose: () => void }) {
  const voidBill = useVoidBill()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void this bill?</DialogTitle>
          <DialogDescription>
            The bill is kept for your records but no longer counts as owed. You can then generate a corrected bill for
            the same month. Pending payment proofs on it are rejected automatically.
          </DialogDescription>
        </DialogHeader>
        <FormField id="void-reason" label="Reason" error={error ?? undefined}>
          <Textarea id="void-reason" rows={2} value={reason} onChange={(e) => (setReason(e.target.value), setError(null))} />
        </FormField>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={voidBill.isPending}
            onClick={() => {
              if (!reason.trim()) return setError('Enter a reason')
              voidBill.mutate(
                { billId, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success('Bill voided')
                    onClose()
                  },
                  onError: (err) => toast.error(getErrorMessage(err)),
                },
              )
            }}
          >
            {voidBill.isPending && <Loader2 className="animate-spin" />}
            Void bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProofDialog({ payment, onClose }: { payment: PaymentOverview; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Proof of payment</DialogTitle>
          <DialogDescription>
            {METHOD_LABEL[payment.method]} · {formatDate(payment.paid_on)}
            {payment.reference_number && ` · Ref ${payment.reference_number}`}
          </DialogDescription>
        </DialogHeader>
        <ProofPreview path={payment.proof_path} />
      </DialogContent>
    </Dialog>
  )
}

// Page ---------------------------------------------------------------------------------

type Overlay =
  | { kind: 'charge'; item?: Tables<'bill_items'> }
  | { kind: 'remove'; item: Tables<'bill_items'> }
  | { kind: 'void' }
  | { kind: 'record' }
  | { kind: 'review'; payment: PaymentOverview }
  | { kind: 'proof'; payment: PaymentOverview }

export function BillDetailPage() {
  const { id = '' } = useParams()
  const currency = useCurrency()
  const bill = useBill(id)
  const items = useBillItems(id)
  const payments = useBillPayments(id)
  const remove = useRemoveCharge()
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const close = () => setOverlay(null)

  if (bill.error) return <ErrorState error={bill.error} onRetry={() => bill.refetch()} />
  if (bill.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-64" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Skeleton className="h-80 rounded-xl lg:col-span-3" />
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        </div>
      </div>
    )
  }
  const b = bill.data
  if (!b) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Bill not found"
        action={<Button asChild variant="outline"><Link to="/billing">Back to billing</Link></Button>}
      />
    )
  }

  const isVoid = b.status === 'void'
  const canPay = !isVoid && b.balance > 0

  const paidShare = b.total_amount > 0 ? (b.amount_paid / b.total_amount) * 100 : 0

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[13px] text-muted-foreground tabular">Bill #{b.bill_number}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl leading-tight font-semibold">
              Room {b.room_number} · {formatPeriod(b.period)}
            </h1>
            <BillStatusBadge status={b.status} overdue={b.is_overdue} />
          </div>
        </div>
        {!isVoid && (
          <div className="flex shrink-0 gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to={`/billing/readings?period=${b.period}`}>
                    <Gauge /> Edit meter readings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={b.amount_paid > 0}
                  onSelect={() => setOverlay({ kind: 'void' })}
                >
                  <Ban /> {b.amount_paid > 0 ? 'Cannot void (has payments)' : 'Void bill'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {isVoid && (
        <Callout tone="neutral" icon={Ban}>
          <span className="font-semibold">Voided {formatDate(b.voided_at?.slice(0, 10))}:</span> {b.void_reason}
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        {/* Balance: first on phones, a sticky side card on large screens */}
        <section aria-label="Balance" className="surface p-5 lg:sticky lg:top-20 lg:order-2">
          <p className="text-[13px] font-medium text-muted-foreground">{isVoid ? 'Voided bill' : b.balance > 0 ? 'Balance due' : 'Paid in full'}</p>
          <p className={cn('mt-1 text-[32px] leading-none font-semibold tracking-tight', !isVoid && b.balance > 0 && b.is_overdue && 'text-destructive')}>
            {formatMoney(isVoid ? 0 : b.balance, currency)}
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {formatMoney(b.amount_paid, currency)} paid of {formatMoney(b.total_amount, currency)}
          </p>
          <div className="mt-3">
            <Meter value={paidShare} label="Share of the bill paid" />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Issued</dt>
              <dd className="mt-0.5 font-medium">{formatDate(b.issue_date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Due</dt>
              <dd className={cn('mt-0.5 font-medium', b.is_overdue && !isVoid && 'text-destructive')}>{formatDate(b.due_date)}</dd>
            </div>
          </dl>
          {canPay && (
            <Button size="lg" className="mt-5 w-full" onClick={() => setOverlay({ kind: 'record' })}>
              <Wallet /> Record payment
            </Button>
          )}
        </section>

        <div className="min-w-0 space-y-4 lg:order-1 lg:col-span-2">
          {/* Invoice */}
          <section aria-label="Invoice" className="surface overflow-hidden">
            <dl className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-[2fr_1fr_1.4fr_1fr]">
              {[
                {
                  label: 'Billed to',
                  value: (
                    <Link to={`/tenants/${b.tenant_id}`} className="underline-offset-2 hover:underline">
                      {b.tenant_name}
                    </Link>
                  ),
                },
                { label: 'Room', value: b.room_number },
                { label: 'Period', value: formatPeriod(b.period) },
                { label: 'Bill no.', value: `#${b.bill_number}` },
              ].map((m) => (
                <div key={m.label} className="min-w-0 bg-card px-5 py-3">
                  <dt className="text-xs text-muted-foreground">{m.label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold">{m.value}</dd>
                </div>
              ))}
            </dl>
            <div className="p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold">Charges</h2>
                {!isVoid && (
                  <Button variant="outline" size="sm" onClick={() => setOverlay({ kind: 'charge' })}>
                    <Plus /> Add charge
                  </Button>
                )}
              </div>
              {items.error ? (
                <p className="text-sm text-destructive">{getErrorMessage(items.error)}</p>
              ) : items.isPending ? (
                <Skeleton className="h-40" />
              ) : (
                <BillItems
                  items={items.data}
                  currency={currency}
                  total={b.total_amount}
                  paid={b.amount_paid}
                  balance={isVoid ? 0 : b.balance}
                  onEdit={isVoid ? undefined : (item) => setOverlay({ kind: 'charge', item })}
                  onRemove={isVoid ? undefined : (item) => setOverlay({ kind: 'remove', item })}
                />
              )}
              {!isVoid && !items.data?.some((i) => i.kind === 'electricity') && (
                <p className="mt-4 rounded-lg border border-dashed px-3 py-2 text-[13px] text-muted-foreground">
                  No electricity charge yet.{' '}
                  <Link to={`/billing/readings?period=${b.period}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                    Enter this month's meter reading
                  </Link>{' '}
                  and it is added here automatically.
                </p>
              )}
            </div>
          </section>

          {/* Payments timeline */}
          <Panel title="Payment activity" description="Only verified payments reduce the balance.">
            {payments.error ? (
              <p className="text-sm text-destructive">{getErrorMessage(payments.error)}</p>
            ) : payments.isPending ? (
              <Skeleton className="h-24" />
            ) : payments.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border">
                {payments.data.map((p) => (
                  <li key={p.id} className="relative flex gap-4 pl-0">
                    <span
                      className={cn(
                        'relative z-10 mt-1.5 size-[15px] shrink-0 rounded-full border-[3px] border-card ring-1',
                        p.status === 'verified' ? 'bg-success ring-success/30' : p.status === 'pending' ? 'bg-info ring-info/30' : 'bg-destructive ring-destructive/30',
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 rounded-xl border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold tabular">{formatMoney(p.amount, currency)}</p>
                          <p className="text-xs text-muted-foreground">
                            {METHOD_LABEL[p.method]} · {formatDate(p.paid_on)}
                            {p.reference_number && ` · Ref ${p.reference_number}`}
                            {p.recorded_by_landlord && ' · recorded by you'}
                          </p>
                        </div>
                        <PaymentStatusBadge status={p.status} />
                      </div>
                      {p.rejection_reason && <p className="mt-2 text-[13px] text-destructive">Rejected: {p.rejection_reason}</p>}
                      {(p.status === 'pending' || p.proof_path) && (
                        <div className="mt-2 flex gap-2">
                          {p.status === 'pending' && (
                            <Button size="sm" onClick={() => setOverlay({ kind: 'review', payment: p })}>
                              Review
                            </Button>
                          )}
                          {p.proof_path && p.status !== 'pending' && (
                            <Button size="sm" variant="ghost" className="-ml-2" onClick={() => setOverlay({ kind: 'proof', payment: p })}>
                              <Eye /> View proof
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      {overlay?.kind === 'charge' && <ChargeDialog billId={b.id} item={overlay.item} onClose={close} />}
      {overlay?.kind === 'void' && <VoidDialog billId={b.id} onClose={close} />}
      {overlay?.kind === 'proof' && <ProofDialog payment={overlay.payment} onClose={close} />}
      <ConfirmDialog
        open={overlay?.kind === 'remove'}
        onOpenChange={(o) => !o && close()}
        title="Remove this charge?"
        description={overlay?.kind === 'remove' ? `"${overlay.item.description}" will be removed from the bill.` : ''}
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          overlay?.kind === 'remove' &&
          remove.mutate(overlay.item.id, {
            onSuccess: () => {
              toast.success('Charge removed')
              close()
            },
            onError: (err) => toast.error(getErrorMessage(err)),
          })
        }
      />
      <RecordPaymentDialog
        bill={b}
        open={overlay?.kind === 'record'}
        onOpenChange={(o) => !o && close()}
      />
      <ReviewPaymentDialog
        payment={overlay?.kind === 'review' ? overlay.payment : null}
        onOpenChange={(o) => !o && close()}
      />
    </div>
  )
}
