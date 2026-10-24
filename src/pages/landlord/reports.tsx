import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { AlertTriangle, Download, Percent, ReceiptText, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ColumnChart } from '@/components/app/column-chart'
import { DailyCashReport } from '@/features/finances/daily-cash-report'
import { PageHeader } from '@/components/app/page-header'
import { Detail, InitialsBadge, Panel, StatGrid, StatGridSkeleton, StatTile } from '@/components/app/panel'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBillsSince, useOpenBills } from '@/features/reports/api'
import { useRoomOverview } from '@/features/rooms/api'
import { useCurrency } from '@/hooks/use-settings'
import { downloadCsv } from '@/lib/csv'
import { currentPeriod, shiftPeriod } from '@/lib/dates'
import { formatCompact, formatDate, formatMoney, formatPeriod, initials } from '@/lib/format'

const MONTHS = 12
const SERIES = [
  { name: 'Billed', color: 'var(--chart-1)' },
  { name: 'Collected', color: 'var(--chart-2)' },
]

const rate = (c: number, b: number) => (b > 0 ? `${Math.round((c / b) * 100)}%` : '—')

function useMonths() {
  const from = shiftPeriod(currentPeriod(), -(MONTHS - 1))
  const query = useBillsSince(from)
  const months = useMemo(() => {
    const rows = Array.from({ length: MONTHS }, (_, i) => {
      const period = shiftPeriod(from, i)
      return { period, billed: 0, collected: 0, outstanding: 0, bills: 0, rent: 0, electricity: 0, water: 0, other: 0 }
    })
    // Drafts have not been sent to tenants, so they are neither billed nor owed yet.
    for (const b of query.data ?? []) {
      const row = b.is_finalized ? rows.find((r) => r.period === b.period) : undefined
      if (!row) continue
      row.billed += b.total_amount
      row.collected += b.amount_paid
      row.outstanding += b.balance
      row.rent += b.rent_paid
      row.electricity += b.electricity_paid
      row.water += b.water_paid
      row.other += b.other_paid
      row.bills++
    }
    return rows
  }, [query.data, from])
  const totals = months.reduce(
    (t, m) => ({ billed: t.billed + m.billed, collected: t.collected + m.collected, outstanding: t.outstanding + m.outstanding }),
    { billed: 0, collected: 0, outstanding: 0 },
  )
  return { ...query, from, months, totals }
}

function CollectionsCard({ currency }: { currency: string }) {
  const { data, isPending, error, refetch, from, months, totals } = useMonths()

  const exportCsv = () =>
    downloadCsv(
      `collections-${from.slice(0, 7)}-to-${currentPeriod().slice(0, 7)}.csv`,
      ['Month', 'Bills', 'Billed', 'Collected', 'Rent collected', 'Electricity collected', 'Water collected', 'Other collected', 'Outstanding', 'Collection rate'],
      months.map((m) => [
        m.period.slice(0, 7),
        m.bills,
        m.billed.toFixed(2),
        m.collected.toFixed(2),
        m.rent.toFixed(2),
        m.electricity.toFixed(2),
        m.water.toFixed(2),
        m.other.toFixed(2),
        m.outstanding.toFixed(2),
        rate(m.collected, m.billed),
      ]),
    )

  return (
    <Panel
      title="Billed vs collected"
      description={`Last ${MONTHS} months, by billing month (${currency})`}
      flush
      action={
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
          <Download /> Export CSV
        </Button>
      }
    >
      {error ? (
        <div className="px-5 pb-5">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : isPending ? (
        <Skeleton className="mx-5 mb-5 h-64" />
      ) : (
        <>
          <div className="px-5 pb-5">
            <ColumnChart
              ariaLabel={`Billed and collected per month, last ${MONTHS} months`}
              series={SERIES}
              height={260}
              data={months.map((m) => ({
                label: format(parseISO(m.period), 'MMM'),
                title: formatPeriod(m.period),
                values: [m.billed, m.collected],
              }))}
              formatValue={(v) => formatMoney(v, currency)}
              formatTick={formatCompact}
            />
          </div>
          {/* Phones: one row per month, collected over billed. */}
          <ul className="divide-y border-t sm:hidden">
            {[...months].reverse().map((m) => (
              <li key={m.period}>
                <Link to={`/billing?period=${m.period}`} className="flex min-h-14 items-center gap-3 px-5 py-3 active:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{formatPeriod(m.period)}</span>
                    <span className="block truncate text-xs text-muted-foreground tabular">
                      {formatMoney(m.collected, currency)} of {formatMoney(m.billed, currency)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular">{rate(m.collected, m.billed)}</span>
                    {m.outstanding > 0 && (
                      <span className="block text-xs text-destructive tabular">{formatMoney(m.outstanding, currency)} open</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 bg-muted/50 px-5 py-3 text-sm font-semibold">
              <span>Total · {rate(totals.collected, totals.billed)}</span>
              <span className="tabular">{formatMoney(totals.collected, currency)}</span>
            </li>
          </ul>
          {/* Table view: every charted value, readable without hovering. */}
          <div className="hidden border-t sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Month</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="pr-5 text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...months].reverse().map((m) => (
                  <TableRow key={m.period}>
                    <TableCell className="pl-5 font-medium whitespace-nowrap">
                      <Link to={`/billing?period=${m.period}`} className="underline-offset-2 hover:underline">
                        {formatPeriod(m.period)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatMoney(m.billed, currency)}</TableCell>
                    <TableCell className="text-right tabular">{formatMoney(m.collected, currency)}</TableCell>
                    <TableCell className="text-right tabular">{formatMoney(m.outstanding, currency)}</TableCell>
                    <TableCell className="pr-5 text-right text-muted-foreground tabular">{rate(m.collected, m.billed)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-5 font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold tabular">{formatMoney(totals.billed, currency)}</TableCell>
                  <TableCell className="text-right font-semibold tabular">{formatMoney(totals.collected, currency)}</TableCell>
                  <TableCell className="text-right font-semibold tabular">{formatMoney(totals.outstanding, currency)}</TableCell>
                  <TableCell className="pr-5 text-right font-semibold tabular">{rate(totals.collected, totals.billed)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}
    </Panel>
  )
}

function useArrears() {
  const query = useOpenBills()
  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; room: string; amount: number; bills: number; oldest: string }>()
    for (const b of query.data ?? []) {
      const cur = map.get(b.tenant_id)
      if (cur) {
        cur.amount += b.balance
        cur.bills++
        if (b.due_date < cur.oldest) cur.oldest = b.due_date
      } else {
        map.set(b.tenant_id, { id: b.tenant_id, name: b.tenant_name, room: b.room_number, amount: b.balance, bills: 1, oldest: b.due_date })
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [query.data])
  return { ...query, rows }
}

function ArrearsCard({ currency }: { currency: string }) {
  const { isPending, error, refetch, rows } = useArrears()
  const today = new Date()
  const daysLate = (due: string) => Math.max(0, differenceInCalendarDays(today, parseISO(due)))

  return (
    <Panel
      title="Arrears"
      description="Tenants with unpaid balances, largest first"
      flush
      className="h-full"
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              `arrears-${format(today, 'yyyy-MM-dd')}.csv`,
              ['Tenant', 'Room', 'Open bills', 'Balance', 'Oldest due date', 'Days late'],
              rows.map((r) => [r.name, r.room, r.bills, r.amount.toFixed(2), r.oldest, daysLate(r.oldest)]),
            )
          }
        >
          <Download /> Export CSV
        </Button>
      }
    >
      {error ? (
        <div className="px-5 pb-5">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : isPending ? (
        <Skeleton className="mx-5 mb-5 h-32" />
      ) : rows.length === 0 ? (
        <p className="border-t px-5 py-10 text-center text-[13px] text-muted-foreground">No unpaid balances.</p>
      ) : (
        <>
        <ul className="divide-y border-t sm:hidden">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/tenants/${r.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3 active:bg-muted">
                <InitialsBadge text={initials(r.name)} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Room {r.room} · {r.bills} {r.bills === 1 ? 'bill' : 'bills'}
                    {daysLate(r.oldest) > 0 ? ` · ${daysLate(r.oldest)} days late` : ` · due ${formatDate(r.oldest, 'MMM d')}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-destructive tabular">{formatMoney(r.amount, currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden border-t sm:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Tenant</TableHead>
                <TableHead className="text-right">Open bills</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="pr-5 text-right">Oldest due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-5">
                    <Link to={`/tenants/${r.id}`} className="flex items-center gap-3">
                      <InitialsBadge text={initials(r.name)} />
                      <span className="min-w-0">
                        <span className="block max-w-44 truncate font-semibold">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">Room {r.room}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular">{r.bills}</TableCell>
                  <TableCell className="text-right font-semibold text-destructive tabular">{formatMoney(r.amount, currency)}</TableCell>
                  <TableCell className="pr-5 text-right whitespace-nowrap">
                    {formatDate(r.oldest, 'MMM d, yyyy')}
                    {daysLate(r.oldest) > 0 && <span className="block text-xs text-muted-foreground">{daysLate(r.oldest)} days late</span>}
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

function OccupancyCard({ currency }: { currency: string }) {
  const { data, isPending, error, refetch } = useRoomOverview()
  const rooms = data ?? []
  const occupied = rooms.filter((r) => r.occupancy === 'occupied')
  const vacant = rooms.filter((r) => r.occupancy === 'vacant')
  const maintenance = rooms.filter((r) => r.occupancy === 'maintenance')
  const rentRoll = occupied.reduce((t, r) => t + (r.lease_rent ?? 0), 0)
  const potential = vacant.reduce((t, r) => t + r.monthly_rent, 0)
  const share = rooms.length ? (occupied.length / rooms.length) * 100 : 0

  return (
    <Panel title="Occupancy" description="Current snapshot" className="h-full">
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="font-display text-3xl font-semibold tabular">{Math.round(share)}%</p>
              <p className="text-[13px] text-muted-foreground tabular">
                {occupied.length} of {rooms.length} rooms
              </p>
            </div>
            <div
              role="meter"
              aria-label="Occupancy"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(share)}
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-chart-2" style={{ width: `${share}%` }} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t pt-4">
            <Detail label="Monthly rent roll">{formatMoney(rentRoll, currency)}</Detail>
            <Detail label="Potential from vacancies">{formatMoney(potential, currency)}/mo</Detail>
            <Detail label="Vacant">{vacant.length ? vacant.map((r) => r.room_number).join(', ') : 'None'}</Detail>
            <Detail label="Under maintenance">{maintenance.length ? maintenance.map((r) => r.room_number).join(', ') : 'None'}</Detail>
          </dl>
        </div>
      )}
    </Panel>
  )
}

export function ReportsPage() {
  const currency = useCurrency()
  const { totals, isPending, error, refetch } = useMonths()
  const arrears = useArrears()
  const owed = arrears.rows.reduce((t, r) => t + r.amount, 0)
  if (error || arrears.error) {
    return <ErrorState error={error ?? arrears.error} onRetry={() => Promise.all([refetch(), arrears.refetch()])} />
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="PROPERTY INSIGHTS" title="Reports" description="Review collections, outstanding balances, and occupancy. Export a table or download your daily cash report." actions={<DailyCashReport />} />
      {isPending || arrears.isPending ? (
        <StatGridSkeleton />
      ) : (
        <StatGrid>
          <StatTile label="Billed, 12 months" value={formatMoney(totals.billed, currency)} icon={ReceiptText} accent="violet" />
          <StatTile label="Collected, 12 months" value={formatMoney(totals.collected, currency)} icon={Wallet} accent="green" />
          <StatTile
            label="Collection rate"
            value={rate(totals.collected, totals.billed)}
            icon={Percent}
            accent="blue"
            sub={<span className="text-xs text-muted-foreground">Of everything billed</span>}
          />
          <StatTile
            label="Owed today"
            value={formatMoney(owed, currency)}
            icon={AlertTriangle}
            accent="amber"
            sub={<span className="text-xs text-muted-foreground">{arrears.rows.length} {arrears.rows.length === 1 ? 'tenant' : 'tenants'}</span>}
          />
        </StatGrid>
      )}
      <CollectionsCard currency={currency} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <ArrearsCard currency={currency} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <OccupancyCard currency={currency} />
        </div>
      </div>
    </div>
  )
}
