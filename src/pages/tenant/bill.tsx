import { CheckCircle2, FileText, Hourglass, ReceiptText, Wallet, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Callout, Meter } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBill, useBillItems, useInvalidateBilling } from '@/features/billing/api'
import { BillItems } from '@/features/billing/bill-items'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { METHOD_LABEL, useBillAllocations, useBillPayments, useCancelOnlinePayment } from '@/features/payments/api'
import { PaymentStatusBadge } from '@/features/payments/components'
import { SubmitPaymentDialog } from '@/features/payments/payment-dialogs'
import { useCurrency } from '@/hooks/use-settings'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The provider sends the tenant back with ?checkout=success|cancelled. The
 * return trip proves nothing: the payment is recorded only when the provider's
 * webhook confirms it, so on success we refresh for a short while until it lands.
 */
function useCheckoutReturn() {
  const [params, setParams] = useSearchParams()
  const cancel = useCancelOnlinePayment()
  const invalidate = useInvalidateBilling()
  const [outcome] = useState(() => params.get('checkout'))
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current || !outcome) return
    handled.current = true
    const ref = params.get('ref')
    if (outcome === 'cancelled' && ref) cancel.mutate(ref)
    setParams({}, { replace: true })
  }, [outcome, params, setParams, cancel])

  useEffect(() => {
    if (outcome !== 'success') return
    const timer = setInterval(() => void invalidate(), 4000)
    const stop = setTimeout(() => clearInterval(timer), 60_000)
    return () => (clearInterval(timer), clearTimeout(stop))
  }, [outcome, invalidate])

  return outcome
}

export function TenantBillPage() {
  const { id = '' } = useParams()
  const currency = useCurrency()
  const bill = useBill(id)
  const items = useBillItems(id)
  const payments = useBillPayments(id)
  const allocations = useBillAllocations(id)
  const [paying, setPaying] = useState(false)
  const checkout = useCheckoutReturn()

  if (bill.error) return <ErrorState error={bill.error} onRetry={() => bill.refetch()} />
  if (bill.isPending) return <Skeleton className="h-96 rounded-xl" />
  const b = bill.data
  if (!b || b.status === 'void') {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Bill not found"
        action={<Button asChild variant="outline"><Link to="/my/bills">Back to bills</Link></Button>}
      />
    )
  }

  const pendingTotal = payments.data?.filter((p) => p.status === 'pending').reduce((t, p) => t + p.amount, 0) ?? 0

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{formatPeriod(b.period)}</h1>
            <BillStatusBadge status={b.status} overdue={b.is_overdue} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Room {b.room_number} · Bill #{b.bill_number} · Due {formatDate(b.due_date)}
          </p>
        </div>
        {b.balance > 0 && (
          <Button size="lg" className="hidden sm:inline-flex" onClick={() => setPaying(true)}>
            <Wallet /> Pay {formatMoney(b.balance, currency)}
          </Button>
        )}
      </div>

      <section aria-label="Balance" className="surface grid grid-cols-1 gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{b.balance > 0 ? 'Balance due' : 'Paid in full'}</p>
          <p className={cn('mt-1 text-[32px] leading-none font-semibold tracking-tight', b.is_overdue && b.balance > 0 && 'text-destructive')}>
            {formatMoney(b.balance, currency)}
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {formatMoney(b.amount_paid, currency)} paid of {formatMoney(b.total_amount, currency)}
          </p>
          <div className="mt-3">
            <Meter value={b.total_amount > 0 ? (b.amount_paid / b.total_amount) * 100 : 0} label="Share of the bill paid" />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 text-sm sm:text-right">
          <div>
            <dt className="text-xs text-muted-foreground">Issued</dt>
            <dd className="mt-0.5 font-medium">{formatDate(b.issue_date, 'MMM d')}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Due</dt>
            <dd className={cn('mt-0.5 font-medium', b.is_overdue && b.balance > 0 && 'text-destructive')}>{formatDate(b.due_date, 'MMM d')}</dd>
          </div>
        </dl>
      </section>

      {checkout === 'success' && (
        <Callout tone="success" icon={CheckCircle2} role="status">
          {b.balance > 0 && b.status === 'unpaid'
            ? 'Payment received by the payment provider. Your balance updates here as soon as they confirm it, usually within a minute.'
            : 'Thank you! Your payment is confirmed and your receipt is ready below.'}
        </Callout>
      )}
      {checkout === 'cancelled' && (
        <Callout tone="neutral" icon={XCircle} role="status">
          Payment cancelled. Nothing was charged. You can pay again any time.
        </Callout>
      )}

      {pendingTotal > 0 && (
        <Callout tone="info" icon={Hourglass}>
          You sent <b className="tabular">{formatMoney(pendingTotal, currency)}</b>. It will be deducted from the balance once your
          landlord verifies it.
        </Callout>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
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
              balance={b.balance}
              paidByItem={allocations.data}
            />
          )}
          {b.amount_paid > 0 && b.balance > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Partial payments go to electricity first, then water, then other charges, then rent.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments for this bill</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.isPending ? (
            <Skeleton className="h-16" />
          ) : !payments.data?.length ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="divide-y">
              {payments.data.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tabular md:text-[13px]">{formatMoney(p.amount, currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {METHOD_LABEL[p.method]} · {formatDate(p.paid_on)}
                      </p>
                    </div>
                    <PaymentStatusBadge status={p.status} />
                  </div>
                  {p.rejection_reason && <p className="mt-1.5 text-[13px] text-destructive">Reason: {p.rejection_reason}</p>}
                  {p.status === 'verified' && (
                    <Button variant="ghost" size="sm" className="mt-1 -ml-3" asChild>
                      <Link to={`/receipts/${p.id}`}>
                        <FileText /> Receipt
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Phones: the pay action stays in reach above the tab bar while reading the bill. */}
      {b.balance > 0 && (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex items-center gap-3 rounded-2xl border bg-card/95 p-2 pl-4 shadow-lg backdrop-blur-md sm:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Balance due</p>
            <p className="truncate text-base font-semibold tabular">{formatMoney(b.balance, currency)}</p>
          </div>
          <Button size="lg" onClick={() => setPaying(true)}>
            <Wallet /> Pay now
          </Button>
        </div>
      )}

      <SubmitPaymentDialog bill={b} open={paying} onOpenChange={setPaying} />
    </div>
  )
}
