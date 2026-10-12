import { ChevronRight, ReceiptText } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/app/page-header'
import { Panel } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Skeleton } from '@/components/ui/skeleton'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { useMyBills } from '@/features/portal/api'
import { useCurrency } from '@/hooks/use-settings'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'

export function TenantBillsPage() {
  const { data, isPending, error, refetch } = useMyBills()
  const currency = useCurrency()
  const outstanding = (data ?? []).reduce((t, b) => t + (b.status === 'paid' ? 0 : b.balance), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bills"
        description={
          outstanding > 0 ? (
            <>
              Outstanding balance:{' '}
              <span className="font-semibold text-destructive tabular">{formatMoney(outstanding, currency)}</span>
            </>
          ) : (
            'Your monthly rent and utility bills.'
          )
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : data.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No bills yet" description="Bills appear here once your landlord issues them." />
      ) : (
        <Panel title="All bills" description={`${data.length} ${data.length === 1 ? 'bill' : 'bills'}`} flush>
        <ul className="divide-y border-t">
          {data.map((b) => (
            <li key={b.id}>
              <Link to={`/my/bills/${b.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/60">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border text-muted-foreground" aria-hidden>
                  <ReceiptText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{formatPeriod(b.period)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Due {formatDate(b.due_date)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[13px] font-semibold tabular">
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
      )}
    </div>
  )
}
