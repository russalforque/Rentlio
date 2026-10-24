import { ArrowRight, Building2, CheckCircle2, Inbox, TriangleAlert, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { InitialsBadge, StatGrid, StatTile } from '@/components/app/panel'
import { Sparkline } from '@/components/app/sparkline'
import type { PaymentOverview } from '@/features/payments/api'
import type { OpenBill } from '@/features/reports/api'
import { formatDate, formatMoney, initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { pct, type MonthRow, type OccupancyCounts } from './metrics'

/** Occupied, maintenance and vacant rooms as one segmented bar with surface gaps. */
export function OccupancyBar({ occupied, maintenance, vacant, className }: OccupancyCounts & { className?: string }) {
  const total = occupied + maintenance + vacant
  if (total === 0) return <div className={cn('h-2 rounded-full bg-muted', className)} />
  const parts = [
    { key: 'occupied', n: occupied, cls: 'bg-chart-2' },
    { key: 'maintenance', n: maintenance, cls: 'bg-warning' },
    { key: 'vacant', n: vacant, cls: 'bg-muted-foreground/20' },
  ].filter((p) => p.n > 0)
  return (
    <div className={cn('flex h-2 gap-0.5', className)} aria-hidden>
      {parts.map((p) => (
        <span key={p.key} className={cn('h-full rounded-full', p.cls)} style={{ flexGrow: p.n }} />
      ))}
    </div>
  )
}

/** Footer line under a KPI figure; wraps instead of truncating when it holds several facts. */
function Meta({ children }: { children: ReactNode }) {
  return <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{children}</span>
}

export function KpiStrip({
  months,
  occupancy,
  open,
  pending,
  currency,
}: {
  months: MonthRow[]
  occupancy: OccupancyCounts
  open: OpenBill[]
  pending: PaymentOverview[]
  currency: string
}) {
  const now = months.at(-1)
  const prev = months.at(-2)
  const recent = months.slice(-6)
  const outstanding = open.reduce((t, b) => t + b.balance, 0)
  const overdue = open.filter((b) => b.is_overdue).length
  const { occupied, vacant } = occupancy
  const roomCount = occupied + occupancy.maintenance + vacant
  const pendingTotal = pending.reduce((t, p) => t + p.amount, 0)

  return (
    <StatGrid>
      <StatTile
        label={now ? `Collected · ${formatDate(now.period, 'MMM')}` : 'Collected'}
        icon={Wallet}
        value={formatMoney(now?.collected ?? 0, currency)}
        to="/reports"
        sub={
          // The current month is still being collected, so a % change against last month's
          // finished total would read as a drop every month. Show last month's figure instead.
          <Meta>
            <span className="truncate">{now?.billed ? `${pct(now.collected, now.billed)}% of billed` : 'Nothing billed yet'}</span>
            {prev && prev.collected > 0 && (
              <span className="truncate">
                · {formatDate(prev.period, 'MMM')} {formatMoney(prev.collected, currency)}
              </span>
            )}
          </Meta>
        }
      >
        <Sparkline values={recent.map((m) => m.collected)} accent="var(--chart-2)" />
      </StatTile>
      <StatTile
        label="Outstanding"
        icon={TriangleAlert}
        value={formatMoney(outstanding, currency)}
        to="/reports"
        sub={
          <Meta>
            {overdue > 0 ? (
              <span className="font-medium text-destructive">
                {overdue} overdue {overdue === 1 ? 'bill' : 'bills'}
              </span>
            ) : (
              <span>Nothing overdue</span>
            )}
          </Meta>
        }
      >
        <Sparkline values={recent.map((m) => m.outstanding)} accent="var(--chart-1)" />
      </StatTile>
      <StatTile
        label="Occupancy"
        icon={Building2}
        value={`${pct(occupied, roomCount)}%`}
        to="/rooms"
        sub={
          <Meta>
            <span className="truncate">
              {occupied} of {roomCount} let · {vacant} vacant
            </span>
          </Meta>
        }
      >
        <OccupancyBar {...occupancy} className="mb-1" />
      </StatTile>
      <StatTile
        label="To review"
        icon={Inbox}
        value={String(pending.length)}
        to="/payments"
        sub={
          <Meta>
            {pending.length > 0 ? (
              <span className="truncate">{formatMoney(pendingTotal, currency)} waiting</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5 text-success" aria-hidden /> All caught up
              </span>
            )}
          </Meta>
        }
      >
        {pending.length > 0 && (
          <span className="flex items-center justify-between gap-2">
            <span className="flex -space-x-2" aria-hidden>
              {pending.slice(0, 3).map((p) => (
                <InitialsBadge key={p.id} text={initials(p.tenant_name)} className="size-7 bg-chip-blue/15 text-[10px] text-info ring-2 ring-card" />
              ))}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
              Review <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </span>
        )}
      </StatTile>
    </StatGrid>
  )
}
