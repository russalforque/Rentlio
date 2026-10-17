import { zodResolver } from '@hookform/resolvers/zod'
import { Ban, CalendarClock, Check, CircleDashed, Eye, FileText, Gauge, Loader2, Lock, MoreHorizontal, PencilLine, Plus, ReceiptText, Send, Wallet } from 'lucide-react'
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
  CHARGE_LABEL,
  useAddCharge,
  useBill,
  useBillDueDateAudit,
  useBillItems,
  useFinalizeBill,
  useRemoveCharge,
  useReopenBill,
  useOverrideBillDueDate,
  useUpdateBillItem,
  useVoidBill,
  type BillOverview,
} from '@/features/billing/api'
import { BillItems } from '@/features/billing/bill-items'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { METHOD_LABEL, useBillAllocations, useBillPayments, type PaymentOverview } from '@/features/payments/api'
import { PaymentStatusBadge, ProofPreview } from '@/features/payments/components'
import { RecordPaymentDialog, ReviewPaymentDialog } from '@/features/payments/payment-dialogs'
import { useCurrency } from '@/hooks/use-settings'
import type { Tables } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/errors'
import { dateInput, moneyInput } from '@/lib/form-fields'
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

const dueDateSchema = z.object({
  due_date: dateInput('due date'),
  reason: z.string().trim().min(1, 'Give a reason').max(500),
})

function DueDateDialog({
  billId,
  currentDate,
  onClose,
}: {
  billId: string
  currentDate: string
  onClose: () => void
}) {
  const update = useOverrideBillDueDate()
  const { register, handleSubmit, formState: { errors } } = useForm<
    z.input<typeof dueDateSchema>,
    unknown,
    z.output<typeof dueDateSchema>
  >({
    resolver: zodResolver(dueDateSchema),
    defaultValues: { due_date: currentDate, reason: '' },
  })

  const onSubmit = (values: z.output<typeof dueDateSchema>) =>
    update.mutate(
      { billId, dueDate: values.due_date, reason: values.reason },
      {
        onSuccess: () => {
          toast.success('Bill due date updated')
          onClose()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Override payment due date</DialogTitle>
            <DialogDescription>The new date and reason are recorded in the bill audit trail.</DialogDescription>
          </DialogHeader>
          <FormField id="override-due-date" label="Due date" error={errors.due_date?.message}>
            <Input id="override-due-date" type="date" aria-invalid={!!errors.due_date} {...register('due_date')} />
          </FormField>
          <FormField id="override-due-reason" label="Reason" error={errors.reason?.message}>
            <Textarea id="override-due-reason" rows={3} aria-invalid={!!errors.reason} {...register('reason')} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2 className="animate-spin" />}
              Save due date
            </Button>
          </DialogFooter>
        </form>
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

/**
 * A draft is the month's consolidated bill being put together: rent is already
 * on it, utilities arrive with the meter readings. Finalizing locks the charges
 * and sends it to the tenant.
 */
function DraftPanel({ bill, items, onFinalize }: { bill: BillOverview; items: Tables<'bill_items'>[]; onFinalize: () => void }) {
  const has = (kind: string) => items.some((i) => i.kind === kind)
  const rows = (['rent', 'electricity', 'water'] as const).map((kind) => ({
    kind,
    state: bill.missing_charges.includes(kind) ? 'missing' : has(kind) ? 'ready' : 'none',
  }))
  const ready = bill.missing_charges.length === 0
  return (
    <section aria-label="Draft bill" className="surface border-chip-violet/25 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Draft · not sent to {bill.tenant_name} yet</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {ready
              ? 'Every required charge is in. Finalize to lock the charges and send the bill.'
              : 'Add the missing charges, then finalize to send one bill with everything on it.'}
          </p>
        </div>
        <Button className="shrink-0" onClick={onFinalize} variant={ready ? 'default' : 'outline'}>
          <Send /> Finalize and send
        </Button>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <li
            key={r.kind}
            className={cn(
              'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              r.state === 'missing' && 'border-dashed',
            )}
          >
            {r.state === 'missing' ? (
              <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <Check className="size-4 shrink-0 text-success" aria-hidden />
            )}
            <span className="font-medium">{CHARGE_LABEL[r.kind]}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {r.state === 'missing' ? (
                <Link to={`/billing/readings?period=${bill.period}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                  Add reading
                </Link>
              ) : r.state === 'ready' ? (
                'Added'
              ) : (
                'Not billed'
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
  | { kind: 'due-date' }
  | { kind: 'finalize'; missing: string[] }
  | { kind: 'reopen' }

export function BillDetailPage() {
  const { id = '' } = useParams()
  const currency = useCurrency()
  const bill = useBill(id)
  const items = useBillItems(id)
  const dueDateAudit = useBillDueDateAudit(id)
  const payments = useBillPayments(id)
  const allocations = useBillAllocations(id)
  const remove = useRemoveCharge()
  const finalize = useFinalizeBill()
  const reopen = useReopenBill()
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const close = () => setOverlay(null)

  const doFinalize = (skipMissing: boolean) =>
    finalize.mutate(
      { billId: id, skipMissing },
      {
        onSuccess: () => {
          toast.success(`Bill sent to ${bill.data?.tenant_name ?? 'the tenant'}`)
          close()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

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
  const isDraft = !isVoid && !b.is_finalized
  const canPay = !isVoid && !isDraft && b.balance > 0
  // Charges that money has been applied to never change, so only a bill with no payments can reopen.
  const canReopen = b.is_finalized && b.amount_paid === 0 && b.pending_payments === 0

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
            <BillStatusBadge status={b.status} overdue={b.is_overdue} draft={isDraft} />
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
                {isDraft ? (
                  <DropdownMenuItem asChild>
                    <Link to={`/billing/readings?period=${b.period}`}>
                      <Gauge /> Edit meter readings
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled={!canReopen} onSelect={() => setOverlay({ kind: 'reopen' })}>
                    <PencilLine /> {canReopen ? 'Reopen to edit charges' : 'Locked (has payments)'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setOverlay({ kind: 'due-date' })}>
                  <CalendarClock /> Override payment due date
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

      {isDraft && items.data && (
        <DraftPanel
          bill={b}
          items={items.data}
          onFinalize={() =>
            b.missing_charges.length ? setOverlay({ kind: 'finalize', missing: b.missing_charges }) : doFinalize(false)
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        {/* Balance: first on phones, a sticky side card on large screens */}
        <section aria-label="Balance" className="surface p-5 lg:sticky lg:top-20 lg:order-2">
          <p className="text-[13px] font-medium text-muted-foreground">
            {isVoid ? 'Voided bill' : isDraft ? 'Draft total' : b.balance > 0 ? 'Balance due' : 'Paid in full'}
          </p>
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
          {dueDateAudit.data && dueDateAudit.data.length > 0 && (
            <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Due-date changes</p>
              <ul className="mt-1 space-y-1">
                {dueDateAudit.data.map((change) => (
                  <li key={change.id}>
                    {formatDate(change.previous_date)} → {formatDate(change.new_date)} · {change.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {b.finalized_at && !isVoid && (
            <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
              <Lock className="size-3.5 shrink-0" aria-hidden />
              Sent {formatDate(b.finalized_at.slice(0, 10))}
              {b.revision > 1 && ' · corrected after issue'}
            </p>
          )}
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
                {isDraft && (
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
                  paidByItem={allocations.data}
                  onEdit={isDraft ? (item) => setOverlay({ kind: 'charge', item }) : undefined}
                  onRemove={isDraft ? (item) => setOverlay({ kind: 'remove', item }) : undefined}
                />
              )}
              {isDraft && !items.data?.some((i) => i.kind === 'electricity') && (
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
                            {p.provider ? ' · paid online' : p.reference_number && ` · Ref ${p.reference_number}`}
                            {p.recorded_by_landlord && ' · recorded by you'}
                          </p>
                        </div>
                        <PaymentStatusBadge status={p.status} />
                      </div>
                      {p.rejection_reason && <p className="mt-2 text-[13px] text-destructive">Rejected: {p.rejection_reason}</p>}
                      {p.provider && p.status === 'pending' && p.notes && (
                        <p className="mt-2 text-[13px] text-warning-foreground">{p.notes}</p>
                      )}
                      {(p.status === 'pending' || p.proof_path || p.status === 'verified') && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.status === 'pending' && (
                            <Button size="sm" onClick={() => setOverlay({ kind: 'review', payment: p })}>
                              Review
                            </Button>
                          )}
                          {p.status === 'verified' && (
                            <Button size="sm" variant="ghost" className="-ml-2" asChild>
                              <Link to={`/receipts/${p.id}`}>
                                <FileText /> Receipt
                              </Link>
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
      {overlay?.kind === 'due-date' && <DueDateDialog billId={b.id} currentDate={b.due_date} onClose={close} />}
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
      <ConfirmDialog
        open={overlay?.kind === 'finalize'}
        onOpenChange={(o) => !o && close()}
        title={`Send without ${overlay?.kind === 'finalize' ? overlay.missing.map((m) => CHARGE_LABEL[m]?.toLowerCase() ?? m).join(' and ') : ''}?`}
        description="This bill has no meter reading for that charge this month. Finalize it anyway if the room has no separate meter or nothing is owed for it. The charges are locked once sent."
        confirmLabel="Finalize without it"
        pending={finalize.isPending}
        onConfirm={() => doFinalize(true)}
      />
      <ConfirmDialog
        open={overlay?.kind === 'reopen'}
        onOpenChange={(o) => !o && close()}
        title="Reopen this bill?"
        description={`It goes back to draft and disappears from ${b.tenant_name}'s portal until you finalize it again. They are notified when the corrected bill is sent.`}
        confirmLabel="Reopen"
        pending={reopen.isPending}
        onConfirm={() =>
          reopen.mutate(b.id, {
            onSuccess: () => {
              toast.success('Bill reopened as a draft')
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
