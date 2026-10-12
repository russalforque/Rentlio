import { Hourglass, ReceiptText, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Callout } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBill, useBillItems } from '@/features/billing/api'
import { BillItems } from '@/features/billing/bill-items'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { METHOD_LABEL, useBillPayments } from '@/features/payments/api'
import { PaymentStatusBadge } from '@/features/payments/components'
import { SubmitPaymentDialog } from '@/features/payments/payment-dialogs'
import { useCurrency } from '@/hooks/use-settings'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'

export function TenantBillPage() {
  const { id = '' } = useParams()
  const currency = useCurrency()
  const bill = useBill(id)
  const items = useBillItems(id)
  const payments = useBillPayments(id)
  const [paying, setPaying] = useState(false)

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
            <h1 className="font-display text-[22px] font-semibold sm:text-2xl">{formatPeriod(b.period)}</h1>
            <BillStatusBadge status={b.status} overdue={b.is_overdue} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Room {b.room_number} · Bill #{b.bill_number} · Due {formatDate(b.due_date)}
          </p>
        </div>
        {b.balance > 0 && (
          <Button size="lg" onClick={() => setPaying(true)}>
            <Wallet /> Pay {formatMoney(b.balance, currency)}
          </Button>
        )}
      </div>

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
            <BillItems items={items.data} currency={currency} total={b.total_amount} paid={b.amount_paid} balance={b.balance} />
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
                    <div>
                      <p className="text-[13px] font-semibold tabular">{formatMoney(p.amount, currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {METHOD_LABEL[p.method]} · {formatDate(p.paid_on)}
                      </p>
                    </div>
                    <PaymentStatusBadge status={p.status} />
                  </div>
                  {p.rejection_reason && <p className="mt-1.5 text-[13px] text-destructive">Reason: {p.rejection_reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SubmitPaymentDialog bill={b} open={paying} onOpenChange={setPaying} />
    </div>
  )
}
