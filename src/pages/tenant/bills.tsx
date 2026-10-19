import { CalendarDays, CheckCircle2, ChevronRight, ReceiptText, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { TenantPageHeader } from '@/components/app/tenant-page-header'
import { Panel } from '@/components/app/panel'
import { TenantIllustration } from '@/components/app/tenant-illustration'
import noBillsIllustration from '@/assets/empty_no_bills.png'
import billsIllustration from '@/assets/bills.png'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { useMyBills } from '@/features/portal/api'
import { useCurrency } from '@/hooks/use-settings'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'

export function TenantBillsPage() {
  const { data, isPending, error, refetch } = useMyBills()
  const currency = useCurrency()
  // Only open bills count: a voided bill keeps its old balance but is not owed.
  const open = (data ?? []).filter((b) => b.status === 'unpaid' || b.status === 'partial')
  const outstanding = open.reduce((t, b) => t + b.balance, 0)
  const nextDue = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  const year = String(new Date().getFullYear())
  const paidThisYear = (data ?? []).filter((b) => b.period.startsWith(year)).reduce((t, b) => t + b.amount_paid, 0)

  return (
    <div className="tenant-page tenant-bills-page @container space-y-5 sm:space-y-6">
      <TenantPageHeader
        title="Bills"
        description="Rent and utilities, all in one place."
        actions={!isPending && !error && !!data?.length && <TenantIllustration src={billsIllustration} width={186} height={235} decorative size="thumbnail" />}
      />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : data.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No bills yet" description="Bills appear here once your landlord issues them."
          illustration={<TenantIllustration src={noBillsIllustration} width={134} height={144} decorative loading="eager" className="mb-4" />} />
      ) : (
        <>
        <section className="surface grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-label="Bill summary">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="size-4" aria-hidden />
              Total outstanding
            </p>
            <p className="tenant-summary-amount font-display mt-3 font-semibold tabular">
              {formatMoney(outstanding, currency)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {open.length ? `${open.length} open ${open.length === 1 ? 'bill' : 'bills'}` : 'You are all paid up'}
              {nextDue && <> <span aria-hidden>·</span> next due {formatDate(nextDue.due_date, 'MMM d')}</>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-w-80">
            <div className="rounded-2xl bg-muted/60 p-4">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-xs text-muted-foreground">Next due</p>
              <p className="mt-1 text-sm font-semibold">{nextDue ? formatDate(nextDue.due_date, 'MMM d') : 'Nothing due'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{nextDue ? formatPeriod(nextDue.period) : 'Enjoy your stay'}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-xs text-muted-foreground">Paid in {year}</p>
              <p className="mt-1 text-sm font-semibold tabular">{formatMoney(paidThisYear, currency)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Verified payments</p>
            </div>
          </div>
          {nextDue && (
            <Button asChild size="lg" className="h-12 w-full rounded-full lg:col-span-2 lg:w-fit">
              <Link to={`/my/pay-online?bill=${nextDue.id}`}><Wallet /> Pay a bill</Link>
            </Button>
          )}
        </section>
        <Panel title="All bills" description={`${data.length} ${data.length === 1 ? 'bill' : 'bills'}`} flush>
        <ul className="divide-y border-t">
          {data.map((b) => (
            <li key={b.id}>
              <Link to={`/my/bills/${b.id}`} className="tenant-list-row group flex min-h-[4.75rem] items-center transition-colors hover:bg-muted/50">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground transition-colors group-hover:bg-card" aria-hidden>
                  <ReceiptText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold break-words">{formatPeriod(b.period)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Due {formatDate(b.due_date)}</p>
                </div>
                <div className="tenant-list-amount flex flex-col items-end gap-1.5">
                  <span className="text-[13px] font-semibold tabular">
                    {formatMoney(b.status === 'paid' ? b.total_amount : b.balance, currency)}
                  </span>
                  <BillStatusBadge status={b.status} overdue={b.is_overdue} />
                </div>
                <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground min-[380px]:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        </Panel>
        </>
      )}
    </div>
  )
}
