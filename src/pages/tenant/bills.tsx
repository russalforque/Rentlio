import { CalendarDays, CheckCircle2, ChevronRight, ReceiptText, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/app/page-header'
import { Panel, StatGrid, StatTile } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
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
    <div className="space-y-4">
      <PageHeader
        title="Bills"
        description="Your monthly rent and utility bills."
      />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : data.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No bills yet" description="Bills appear here once your landlord issues them." />
      ) : (
        <>
        <StatGrid className="lg:grid-cols-3">
          <StatTile
            label="Outstanding"
            value={formatMoney(outstanding, currency)}
            icon={Wallet}
            sub={
              <span className={outstanding > 0 ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                {open.length ? `${open.length} open ${open.length === 1 ? 'bill' : 'bills'}` : 'All paid up'}
              </span>
            }
          />
          <StatTile
            label="Next due"
            value={nextDue ? formatDate(nextDue.due_date, 'MMM d') : '—'}
            icon={CalendarDays}
            sub={<span className="text-xs text-muted-foreground">{nextDue ? `${formatPeriod(nextDue.period)} bill` : 'Nothing due'}</span>}
          />
          <div className="col-span-2 grid lg:col-span-1">
            <StatTile
              label={`Paid in ${year}`}
              value={formatMoney(paidThisYear, currency)}
              icon={CheckCircle2}
              sub={<span className="text-xs text-muted-foreground">Verified payments</span>}
            />
          </div>
        </StatGrid>
        <Panel title="All bills" description={`${data.length} ${data.length === 1 ? 'bill' : 'bills'}`} flush>
        <ul className="divide-y border-t">
          {data.map((b) => (
            <li key={b.id}>
              <Link to={`/my/bills/${b.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/60 sm:gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border text-muted-foreground" aria-hidden>
                  <ReceiptText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold md:text-[13px]">{formatPeriod(b.period)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Due {formatDate(b.due_date)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular md:text-[13px]">
                    {formatMoney(b.status === 'paid' ? b.total_amount : b.balance, currency)}
                  </span>
                  <BillStatusBadge status={b.status} overdue={b.is_overdue} />
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
