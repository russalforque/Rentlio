import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  DoorOpen,
  Gauge,
  Inbox,
  type LucideIcon,
  MailWarning,
  Percent,
  ReceiptText,
  Tags,
  TriangleAlert,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AreaChart } from '@/components/app/area-chart'
import { PageHeader } from '@/components/app/page-header'
import { InitialsBadge, InsightRow, Panel, PanelLink, Segmented, StatusPill } from '@/components/app/panel'
import { Sparkline } from '@/components/app/sparkline'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useReadingSheet } from '@/features/billing/api'
import { BillingCalendar } from '@/features/billing/billing-calendar'
import { METHOD_LABEL, usePendingPayments, type PaymentOverview } from '@/features/payments/api'
import { type OpenBill, useBillsSince, useOpenBills, useRecentVerifiedPayments } from '@/features/reports/api'
import { type RoomOverview, useRoomOverview } from '@/features/rooms/api'
import { RoomMap, RoomMapLegend } from '@/features/rooms/room-map'
import { InviteTenantDialog } from '@/features/tenants/invite-tenant-dialog'
import { useTenants } from '@/features/tenants/api'
import { useProfile } from '@/hooks/use-auth'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { currentPeriod, nextBillingDates, shiftPeriod, todayISO } from '@/lib/dates'
import { formatCompact, formatDate, formatMoney, formatPeriod, initials } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Months of history loaded once for the KPIs, sparklines and revenue chart. */
const HISTORY = 12

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

interface MonthRow {
  period: string
  billed: number
  collected: number
  outstanding: number
}

/** Billed, collected and still-open totals per billing month, oldest first. */
function useMonthlyTotals() {
  const from = shiftPeriod(currentPeriod(), -(HISTORY - 1))
  const query = useBillsSince(from)
  const months = useMemo(() => {
    const rows: MonthRow[] = Array.from({ length: HISTORY }, (_, i) => ({ period: shiftPeriod(from, i), billed: 0, collected: 0, outstanding: 0 }))
    for (const b of query.data ?? []) {
      const row = rows.find((r) => r.period === b.period)
      if (!row) continue
      row.billed += b.total_amount
      row.collected += b.amount_paid
      row.outstanding += b.balance
    }
    return rows
  }, [query.data, from])
  return { ...query, months }
}

// KPI strip -------------------------------------------------------------------------

/** Signed change against the previous month, green when the move is good. */
function Delta({ current, previous, upIsGood = true }: { current: number; previous: number; upIsGood?: boolean }) {
  if (previous <= 0) return null
  const change = Math.round(((current - previous) / previous) * 100)
  const up = change >= 0
  const good = change === 0 || up === upIsGood
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular',
        good ? 'bg-success/10 text-success' : 'bg-destructive/8 text-destructive',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{up ? 'Up' : 'Down'} </span>
      {Math.abs(change)}%
    </span>
  )
}

function Kpi({
  label,
  icon: Icon,
  value,
  meta,
  to,
  children,
}: {
  label: string
  icon: LucideIcon
  value: string
  meta: ReactNode
  to: string
  /** Visual below the figure: a sparkline, a meter or an avatar stack. */
  children?: ReactNode
}) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-col bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:p-5"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-muted-foreground">{label}</span>
        <Icon className="size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground" aria-hidden />
      </span>
      <span className="mt-2 truncate text-[22px] leading-tight font-semibold tracking-tight min-[400px]:text-2xl sm:text-[28px]">{value}</span>
      <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{meta}</span>
      {children && <span className="mt-auto block pt-4">{children}</span>}
    </Link>
  )
}

/** Occupied, maintenance and vacant rooms as one segmented bar with surface gaps. */
function OccupancyBar({ occupied, maintenance, vacant, className }: { occupied: number; maintenance: number; vacant: number; className?: string }) {
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

function KpiStrip({
  months,
  rooms,
  open,
  pending,
  currency,
}: {
  months: MonthRow[]
  rooms: RoomOverview[]
  open: OpenBill[]
  pending: PaymentOverview[]
  currency: string
}) {
  const now = months.at(-1)
  const prev = months.at(-2)
  const recent = months.slice(-6)
  const outstanding = open.reduce((t, b) => t + b.balance, 0)
  const overdue = open.filter((b) => b.is_overdue).length
  const occupied = rooms.filter((r) => r.occupancy === 'occupied').length
  const maintenance = rooms.filter((r) => r.occupancy === 'maintenance').length
  const vacant = rooms.length - occupied - maintenance
  const pendingTotal = pending.reduce((t, p) => t + p.amount, 0)

  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-xs lg:grid-cols-4">
      <Kpi
        label={`Collected · ${format(new Date(), 'MMM')}`}
        icon={Wallet}
        value={formatMoney(now?.collected ?? 0, currency)}
        to="/reports"
        meta={
          <>
            <Delta current={now?.collected ?? 0} previous={prev?.collected ?? 0} />
            <span className="truncate">{now?.billed ? `${pct(now.collected, now.billed)}% of billed` : 'Nothing billed yet'}</span>
          </>
        }
      >
        <Sparkline values={recent.map((m) => m.collected)} accent="var(--chart-2)" />
      </Kpi>
      <Kpi
        label="Outstanding"
        icon={TriangleAlert}
        value={formatMoney(outstanding, currency)}
        to="/reports"
        meta={
          overdue > 0 ? (
            <span className="font-medium text-destructive">
              {overdue} overdue {overdue === 1 ? 'bill' : 'bills'}
            </span>
          ) : (
            <span>Nothing overdue</span>
          )
        }
      >
        <Sparkline values={recent.map((m) => m.outstanding)} accent="var(--chart-1)" />
      </Kpi>
      <Kpi
        label="Occupancy"
        icon={Building2}
        value={`${pct(occupied, rooms.length)}%`}
        to="/rooms"
        meta={
          <span className="truncate">
            {occupied} of {rooms.length} let · {vacant} vacant
          </span>
        }
      >
        <OccupancyBar occupied={occupied} maintenance={maintenance} vacant={vacant} className="mb-1" />
      </Kpi>
      <Kpi
        label="To verify"
        icon={Inbox}
        value={String(pending.length)}
        to="/payments"
        meta={
          pending.length > 0 ? (
            <span className="truncate">{formatMoney(pendingTotal, currency)} waiting</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-success" aria-hidden /> All caught up
            </span>
          )
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
      </Kpi>
    </section>
  )
}

// Revenue -------------------------------------------------------------------------

function RevenueCard({ months, currency, className }: { months: MonthRow[]; currency: string; className?: string }) {
  const [range, setRange] = useState<'6' | '12'>('6')
  const rows = months.slice(-Number(range))
  const billed = rows.reduce((t, r) => t + r.billed, 0)
  const collected = rows.reduce((t, r) => t + r.collected, 0)
  const outstanding = rows.reduce((t, r) => t + r.outstanding, 0)

  return (
    <Panel
      title="Revenue"
      description="Billed and collected, by billing month"
      className={className}
      action={
        <>
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: '6', label: '6M' },
              { value: '12', label: '12M' },
            ]}
          />
          <PanelLink to="/reports">Report</PanelLink>
        </>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Collected, last {range} months</p>
          <p className="mt-1 text-[32px] leading-none font-semibold tracking-tight sm:text-[40px]">{formatMoney(collected, currency)}</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-foreground/80" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full bg-chart-1" aria-hidden /> Billed
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-sm border-t-2 border-chart-2 bg-chart-2/15" aria-hidden /> Collected
          </li>
        </ul>
      </div>

      <div className="mt-5">
        <AreaChart
          ariaLabel={`Billed and collected per month, last ${range} months`}
          height={240}
          labels={rows.map((r) => format(parseISO(r.period), 'MMM'))}
          titles={rows.map((r) => formatPeriod(r.period))}
          series={[
            { name: 'Billed', color: 'var(--chart-1)', kind: 'line', values: rows.map((r) => r.billed) },
            { name: 'Collected', color: 'var(--chart-2)', kind: 'area', values: rows.map((r) => r.collected) },
          ]}
          formatValue={(v) => formatMoney(v, currency)}
          formatTick={formatCompact}
        />
      </div>

      <dl className="mt-5 grid grid-cols-1 divide-y rounded-xl border bg-muted/30 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          { label: 'Billed', value: formatMoney(billed, currency) },
          { label: 'Collection rate', value: `${pct(collected, billed)}%` },
          { label: 'Still open', value: formatMoney(outstanding, currency), alert: outstanding > 0 },
        ].map((s) => (
          <div key={s.label} className="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5 sm:block">
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className={cn('truncate text-sm font-semibold tabular sm:mt-0.5', s.alert && 'text-destructive')}>{s.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

// Transactions --------------------------------------------------------------------

interface Txn {
  id: string
  tenant: string
  room: string
  method: string
  date: string
  amount: number
  pending: boolean
}

function TransactionsCard({ currency, className }: { currency: string; className?: string }) {
  const recent = useRecentVerifiedPayments(6)
  const pending = usePendingPayments()
  const pendingCount = pending.data?.length ?? 0
  const [tab, setTab] = useState<'recent' | 'review'>('recent')
  const source = tab === 'recent' ? recent : pending
  const rows: Txn[] =
    tab === 'recent'
      ? (recent.data ?? []).map((p) => ({ id: p.id, tenant: p.tenant_name, room: p.room_number, method: METHOD_LABEL[p.method], date: p.paid_on, amount: p.amount, pending: false }))
      : (pending.data ?? []).slice(0, 6).map((p) => ({ id: p.id, tenant: p.tenant_name, room: p.room_number, method: METHOD_LABEL[p.method], date: p.paid_on, amount: p.amount, pending: true }))

  const status = (t: Txn) => (t.pending ? <StatusPill tone="info">Awaiting review</StatusPill> : <StatusPill tone="success">Verified</StatusPill>)

  return (
    <Panel
      title="Transactions"
      flush
      className={className}
      action={
        <>
          <Segmented
            label="Transactions view"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'review', label: pendingCount ? `To review · ${pendingCount}` : 'To review' },
            ]}
          />
          <PanelLink to={tab === 'recent' ? '/payments?tab=history' : '/payments'}>View all</PanelLink>
        </>
      }
    >
      {source.isPending ? (
        <Skeleton className="mx-5 mb-5 h-48" />
      ) : rows.length === 0 ? (
        <p className="flex items-center justify-center gap-2 border-t px-5 py-12 text-[13px] text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          {tab === 'recent' ? 'No verified payments yet.' : 'No payments waiting for review.'}
        </p>
      ) : (
        <>
          {/* Phones: one row per payment */}
          <ul className="divide-y border-t sm:hidden">
            {rows.map((t) => (
              <li key={t.id}>
                <Link to={t.pending ? '/payments' : '/payments?tab=history'} className="flex min-h-16 items-center gap-3 px-5 py-3 active:bg-muted">
                  <InitialsBadge text={initials(t.tenant)} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.tenant}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Room {t.room} · {t.method} · {formatDate(t.date, 'MMM d')}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular">{formatMoney(t.amount, currency)}</span>
                    {t.pending && <StatusPill tone="info">Review</StatusPill>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Table className="hidden sm:table">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Tenant</TableHead>
                <TableHead className="hidden lg:table-cell">Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-5">
                    <span className="flex items-center gap-3">
                      <InitialsBadge text={initials(t.tenant)} />
                      <span className="min-w-0">
                        <span className="block max-w-48 truncate font-semibold">{t.tenant}</span>
                        <span className="block text-xs text-muted-foreground">Room {t.room}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{t.method}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(t.date, 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                    {t.pending ? (
                      <Link to="/payments" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        {status(t)}
                      </Link>
                    ) : (
                      status(t)
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right font-semibold tabular">{formatMoney(t.amount, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Panel>
  )
}

// Watchlist -----------------------------------------------------------------------

function DateBlock({ date, tone }: { date: string; tone?: 'overdue' }) {
  return (
    <span
      className={cn(
        'grid w-11 shrink-0 place-items-center rounded-lg border py-1 text-center leading-none',
        tone === 'overdue' && 'border-destructive/25 bg-destructive/5',
      )}
      aria-hidden
    >
      <span className={cn('text-[10px] font-medium uppercase', tone === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
        {formatDate(date, 'MMM')}
      </span>
      <span className="mt-0.5 text-[15px] font-semibold tabular">{formatDate(date, 'd')}</span>
    </span>
  )
}

function WatchlistCard({ bills, currency, className }: { bills: OpenBill[]; currency: string; className?: string }) {
  const today = todayISO()
  const horizon = format(addDays(new Date(), 14), 'yyyy-MM-dd')
  const dueSoon = bills.filter((b) => !b.is_overdue && b.due_date >= today && b.due_date <= horizon).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const overdue = useMemo(() => {
    const map = new Map<string, { id: string; name: string; room: string; amount: number; oldest: string; bills: number }>()
    for (const b of bills.filter((x) => x.is_overdue)) {
      const cur = map.get(b.tenant_id)
      if (cur) {
        cur.amount += b.balance
        cur.bills++
        if (b.due_date < cur.oldest) cur.oldest = b.due_date
      } else map.set(b.tenant_id, { id: b.tenant_id, name: b.tenant_name, room: b.room_number, amount: b.balance, oldest: b.due_date, bills: 1 })
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [bills])
  const [tab, setTab] = useState<'soon' | 'overdue'>(overdue.length ? 'overdue' : 'soon')
  const overdueTotal = overdue.reduce((t, o) => t + o.amount, 0)
  const dueSoonTotal = dueSoon.reduce((t, b) => t + b.balance, 0)

  return (
    <Panel
      title="Collections watchlist"
      className={className}
      action={
        <Segmented
          label="Watchlist view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overdue', label: `Overdue · ${overdue.length}` },
            { value: 'soon', label: `Due soon · ${dueSoon.length}` },
          ]}
        />
      }
    >
      <dl className="mb-4 grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Overdue</dt>
          <dd className="mt-0.5 truncate text-[15px] font-semibold text-destructive tabular">{formatMoney(overdueTotal, currency)}</dd>
        </div>
        <div className="min-w-0 rounded-xl border bg-muted/30 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Due in 14 days</dt>
          <dd className="mt-0.5 truncate text-[15px] font-semibold tabular">{formatMoney(dueSoonTotal, currency)}</dd>
        </div>
      </dl>
      {tab === 'overdue' ? (
        overdue.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden /> No overdue balances.
          </p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {overdue.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link to={`/tenants/${t.id}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                  <DateBlock date={t.oldest} tone="overdue" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Room {t.room} · {differenceInCalendarDays(new Date(), parseISO(t.oldest))} days late
                      {t.bills > 1 ? ` · ${t.bills} bills` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-destructive tabular">{formatMoney(t.amount, currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : dueSoon.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden /> Nothing due in the next two weeks.
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {dueSoon.slice(0, 5).map((b) => {
            const days = differenceInCalendarDays(parseISO(b.due_date), new Date())
            return (
              <li key={b.id}>
                <Link to={`/billing/bills/${b.id}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                  <DateBlock date={b.due_date} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{b.tenant_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Room {b.room_number} · {days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `in ${days} days`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular">{formatMoney(b.balance, currency)}</span>
                </Link>
              </li>
            )
          })}
          {dueSoon.length > 5 && (
            <li className="px-2 pt-1">
              <Link to="/billing" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                +{dueSoon.length - 5} more in Billing
              </Link>
            </li>
          )}
        </ul>
      )}
    </Panel>
  )
}

// Occupancy -----------------------------------------------------------------------

function OccupancyCard({ rooms, currency, className }: { rooms: RoomOverview[]; currency: string; className?: string }) {
  const occupied = rooms.filter((r) => r.occupancy === 'occupied')
  const maintenance = rooms.filter((r) => r.occupancy === 'maintenance').length
  const vacant = rooms.filter((r) => r.occupancy === 'vacant')
  const rentRoll = occupied.reduce((t, r) => t + (r.lease_rent ?? 0), 0)
  const potential = vacant.reduce((t, r) => t + r.monthly_rent, 0)

  return (
    <Panel title="Occupancy" description="Select a room to open its tenant" className={className} action={<PanelLink to="/rooms">Manage rooms</PanelLink>}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <OccupancyBar occupied={occupied.length} maintenance={maintenance} vacant={vacant.length} className="h-2.5" />
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-2" aria-hidden /> {occupied.length} occupied
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground/30" aria-hidden /> {vacant.length} vacant
            </li>
            {maintenance > 0 && (
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" aria-hidden /> {maintenance} maintenance
              </li>
            )}
          </ul>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-right max-sm:text-left">
          <div>
            <dt className="text-xs text-muted-foreground">Rent roll</dt>
            <dd className="text-sm font-semibold tabular">{formatMoney(rentRoll, currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Vacancy upside</dt>
            <dd className="text-sm font-semibold tabular">+{formatMoney(potential, currency)}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-5 space-y-4 border-t pt-5">
        <RoomMap rooms={rooms} currency={currency} />
        <RoomMapLegend />
      </div>
    </Panel>
  )
}

// Page ----------------------------------------------------------------------------

interface Insight {
  key: string
  icon: LucideIcon
  title: string
  note: string
  to?: string
  trailing?: ReactNode
}

export function DashboardPage() {
  const period = currentPeriod()
  const currency = useCurrency()
  const profile = useProfile()
  const settings = useSettings()
  const rooms = useRoomOverview()
  const history = useMonthlyTotals()
  const open = useOpenBills()
  const pending = usePendingPayments()
  const sheet = useReadingSheet(period)
  const tenants = useTenants()
  const [inviting, setInviting] = useState(false)

  const error = rooms.error ?? history.error ?? open.error ?? pending.error
  const loading = rooms.isPending || history.isPending || open.isPending || pending.isPending

  const s = settings.data
  const next = s ? nextBillingDates(s.billing_day, s.due_days) : null
  const roomList = rooms.data ?? []
  const occupied = roomList.filter((r) => r.occupancy === 'occupied').length
  const thisMonth = history.months.at(-1)
  const billsThisMonth = (history.data ?? []).filter((b) => b.period === period).length
  const pastBillingDay = s ? new Date().getDate() >= s.billing_day : false
  const toVerify = pending.data?.length ?? 0

  // Things to act on first, each one tap from the fix; then standing insights to fill the card.
  const insights: Insight[] = []
  if (toVerify) {
    insights.push({
      key: 'verify',
      icon: Inbox,
      title: `${toVerify} ${toVerify === 1 ? 'payment' : 'payments'} to verify`,
      note: 'Tenants uploaded proof of payment',
      to: '/payments',
      trailing: <span className="text-destructive">Review</span>,
    })
  }
  if (occupied > 0 && billsThisMonth < occupied && (pastBillingDay || billsThisMonth === 0)) {
    insights.push({
      key: 'generate',
      icon: ReceiptText,
      title: billsThisMonth === 0 ? `${formatPeriod(period)} bills not generated` : `${occupied - billsThisMonth} rooms without a bill`,
      note: `Occupied rooms missing their ${formatPeriod(period)} bill`,
      to: `/billing?period=${period}`,
    })
  }
  const missingReadings = (sheet.data ?? []).filter((r) => r.is_billable && r.electricity_current === null).length
  if (missingReadings > 0) {
    insights.push({
      key: 'readings',
      icon: Gauge,
      title: `${missingReadings} meter ${missingReadings === 1 ? 'reading' : 'readings'} missing`,
      note: `Needed for ${formatPeriod(period)} electricity charges`,
      to: `/billing/readings?period=${period}`,
    })
  }
  const unpriced = roomList.filter((r) => r.monthly_rent <= 0).length
  if (unpriced > 0) {
    insights.push({ key: 'rent', icon: Tags, title: `${unpriced} ${unpriced === 1 ? 'room has' : 'rooms have'} no rent`, note: 'Set a standard monthly rent', to: '/rooms' })
  }
  const invited = (tenants.data ?? []).filter((t) => t.account_status === 'invited').length
  if (invited > 0) {
    insights.push({
      key: 'invites',
      icon: MailWarning,
      title: `${invited} ${invited === 1 ? 'invite' : 'invites'} not accepted`,
      note: 'Tenants who have not activated their account',
      to: '/tenants',
    })
  }
  const standing: Insight[] = [
    {
      key: 'rate',
      icon: Percent,
      title: 'Collection rate',
      note: thisMonth?.billed ? `${formatMoney(thisMonth.collected, currency)} of ${formatMoney(thisMonth.billed, currency)} this month` : 'Nothing billed this month yet',
      trailing: thisMonth?.billed ? <span className="tabular">{pct(thisMonth.collected, thisMonth.billed)}%</span> : undefined,
    },
    {
      key: 'next',
      icon: CalendarClock,
      title: 'Next billing run',
      note: next ? `Issued ${format(next.issue, 'EEE, MMM d')} · due ${format(next.due, 'MMM d')}` : 'Loading schedule…',
    },
  ]
  const actionRows = [...insights, ...standing].slice(0, Math.max(4, insights.length))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${format(new Date(), 'EEEE, MMMM d')}${s?.property_name ? ` · ${s.property_name}` : ''}`}
        title={`${greeting()}, ${profile.full_name.split(' ')[0] || 'there'}`}
        description={`Here’s how ${format(new Date(), 'MMMM')} is going.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/billing/readings?period=${period}`}>
                <Gauge /> <span className="max-[380px]:sr-only">Meter readings</span>
              </Link>
            </Button>
            <Button onClick={() => setInviting(true)}>
              <UserPlus /> Invite tenant
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => (rooms.refetch(), history.refetch(), open.refetch(), pending.refetch())} />
      ) : loading ? (
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-44 rounded-xl lg:h-40" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Skeleton className="h-96 rounded-xl xl:col-span-8" />
            <Skeleton className="h-96 rounded-xl xl:col-span-4" />
          </div>
        </div>
      ) : (
        <>
          <KpiStrip months={history.months} rooms={roomList} open={open.data ?? []} pending={pending.data ?? []} currency={currency} />

          {/* Phones: what needs doing first, charts after. Large screens: an 8/4 grid. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
            <RevenueCard months={history.months} currency={currency} className="order-4 md:col-span-2 xl:order-1 xl:col-span-8" />

            <Panel
              title="Action center"
              className="order-1 xl:order-2 xl:col-span-4"
              action={insights.length > 0 ? <StatusPill tone="destructive">{insights.length} to do</StatusPill> : <StatusPill tone="success">All caught up</StatusPill>}
            >
              <ul className="space-y-2">
                {actionRows.map((t) => (
                  <li key={t.key}>
                    <InsightRow icon={t.icon} title={t.title} note={t.note} to={t.to} trailing={t.trailing} />
                  </li>
                ))}
              </ul>
              {/* Phones reach these from the tab bar and More sheet. */}
              <div className="mt-auto hidden pt-5 md:block">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Quick actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { to: `/billing?period=${period}`, icon: ReceiptText, label: 'Billing' },
                    { to: `/billing/readings?period=${period}`, icon: Gauge, label: 'Readings' },
                    { to: '/rooms', icon: DoorOpen, label: 'Rooms' },
                    { to: '/reports', icon: BarChart3, label: 'Reports' },
                  ].map((a) => (
                    <Link
                      key={a.label}
                      to={a.to}
                      className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-10"
                    >
                      <a.icon className="size-4 text-muted-foreground" aria-hidden />
                      {a.label}
                    </Link>
                  ))}
                </div>
              </div>
            </Panel>

            <TransactionsCard currency={currency} className="order-3 md:col-span-2 xl:order-3 xl:col-span-8" />

            <WatchlistCard bills={open.data ?? []} currency={currency} className="order-2 xl:order-4 xl:col-span-4" />

            <OccupancyCard rooms={roomList} currency={currency} className="order-5 md:col-span-2 xl:order-5 xl:col-span-8" />

            <Panel
              title="Billing calendar"
              description={next ? `Next bills ${format(next.issue, 'MMM d')}, due ${format(next.due, 'MMM d')}` : undefined}
              className="order-6 md:col-span-2 xl:order-6 xl:col-span-4"
            >
              {s ? <BillingCalendar billingDay={s.billing_day} dueDays={s.due_days} /> : <Skeleton className="h-72" />}
            </Panel>
          </div>
        </>
      )}

      <InviteTenantDialog open={inviting} onOpenChange={setInviting} />
    </div>
  )
}
