import { formatDistanceToNow, parseISO } from 'date-fns'
import { CheckCircle2, History as HistoryIcon, Inbox, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/app/page-header'
import { FilterChips, InitialsBadge, Panel } from '@/components/app/panel'
import { PeriodPicker } from '@/components/app/period-picker'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { METHOD_LABEL, usePaymentHistory, usePendingPayments, type PaymentOverview } from '@/features/payments/api'
import { PaymentStatusBadge } from '@/features/payments/components'
import { ReviewPaymentDialog } from '@/features/payments/payment-dialogs'
import { usePeriodParam } from '@/hooks/use-period-param'
import { useCurrency } from '@/hooks/use-settings'
import { shiftPeriod } from '@/lib/dates'
import { formatDate, formatMoney, formatPeriod, initials } from '@/lib/format'

function Queue({ currency }: { currency: string }) {
  const { data, isPending, error, refetch } = usePendingPayments()
  const [reviewing, setReviewing] = useState<PaymentOverview | null>(null)

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isPending) return <Skeleton className="h-40 rounded-xl" />
  if (data.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="All caught up"
        description="When tenants upload proof of payment, it appears here for you to verify."
      />
    )
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((p) => (
          <li key={p.id} className="surface flex flex-col p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <InitialsBadge text={initials(p.tenant_name)} className="size-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold md:text-[13px]">{p.tenant_name}</p>
                <p className="text-xs text-muted-foreground">
                  Room {p.room_number} · {formatPeriod(p.period)}
                </p>
              </div>
              <p className="font-display shrink-0 text-lg font-semibold tabular">{formatMoney(p.amount, currency)}</p>
            </div>
            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {METHOD_LABEL[p.method]} · paid {formatDate(p.paid_on)} · sent{' '}
              {formatDistanceToNow(parseISO(p.created_at), { addSuffix: true })}
            </p>
            <Button className="mt-4 w-full" onClick={() => setReviewing(p)}>
              Review
            </Button>
          </li>
        ))}
      </ul>
      <ReviewPaymentDialog payment={reviewing} onOpenChange={(o) => !o && setReviewing(null)} />
    </>
  )
}

function History({ currency }: { currency: string }) {
  const [period, setPeriod] = usePeriodParam()
  const { data, isPending, error, refetch } = usePaymentHistory(period, shiftPeriod(period, 1))
  const verifiedTotal = (data ?? []).filter((p) => p.status === 'verified').reduce((t, p) => t + p.amount, 0)

  return (
    <Panel
      title="Payment history"
      description={data ? `Verified in ${formatPeriod(period)}: ${formatMoney(verifiedTotal, currency)}` : undefined}
      flush
      action={<PeriodPicker value={period} onChange={setPeriod} />}
    >
      {error ? (
        <div className="px-5 pb-5">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : isPending ? (
        <Skeleton className="mx-5 mb-5 h-48" />
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t px-5 py-12 text-center text-[13px] text-muted-foreground">
          <Wallet className="size-5" aria-hidden />
          No payments in {formatPeriod(period)}
        </div>
      ) : (
        <>
        {/* Phones: one row per payment */}
        <ul className="divide-y border-t md:hidden">
          {data.map((p) => (
            <li key={p.id}>
              <Link to={`/billing/bills/${p.bill_id}`} className="flex min-h-16 items-center gap-3 px-5 py-3 active:bg-muted">
                <InitialsBadge text={initials(p.tenant_name)} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.tenant_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Room {p.room_number} · {METHOD_LABEL[p.method]} · {formatDate(p.paid_on, 'MMM d')}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular">{formatMoney(p.amount, currency)}</span>
                  <PaymentStatusBadge status={p.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden border-t md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Date</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="pr-5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-5 whitespace-nowrap text-muted-foreground">{formatDate(p.paid_on, 'MMM d')}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <InitialsBadge text={initials(p.tenant_name)} />
                      <span className="min-w-0">
                        <span className="block max-w-44 truncate font-semibold">{p.tenant_name}</span>
                        <span className="block text-xs text-muted-foreground">Room {p.room_number}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link to={`/billing/bills/${p.bill_id}`} className="whitespace-nowrap underline-offset-2 hover:underline">
                      {formatPeriod(p.period)}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {METHOD_LABEL[p.method]}
                    {p.reference_number && (
                      <span className="block text-xs text-muted-foreground">Ref {p.reference_number}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular">{formatMoney(p.amount, currency)}</TableCell>
                  <TableCell className="pr-5">
                    <PaymentStatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </Panel>
  )
}

export function PaymentsPage() {
  const currency = useCurrency()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'history' ? 'history' : 'queue'
  const { data: pending } = usePendingPayments()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Verify payment proofs from tenants and browse payment history. To record cash, open the bill."
        tabs={
          <FilterChips
            label="Payments view"
            value={tab}
            onChange={(v) =>
              setParams(
                (prev) => {
                  const p = new URLSearchParams(prev)
                  p.set('tab', v)
                  return p
                },
                { replace: true },
              )
            }
            options={[
              { value: 'queue', label: 'To verify', icon: Inbox, count: pending?.length ?? 0 },
              { value: 'history', label: 'History', icon: HistoryIcon },
            ]}
          />
        }
      />
      {tab === 'queue' ? <Queue currency={currency} /> : <History currency={currency} />}
    </div>
  )
}
