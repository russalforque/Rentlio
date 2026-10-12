import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Inbox,
  type LucideIcon,
  MailWarning,
  Percent,
  ReceiptText,
  Tags,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ColumnChart } from '@/components/app/column-chart'
import { PageHeader } from '@/components/app/page-header'
import { InitialsBadge, InsightRow, Panel, PanelLink, Segmented, StatGrid, StatTile, StatusPill, Trend } from '@/components/app/panel'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useReadingSheet } from '@/features/billing/api'
import { BillingCalendar } from '@/features/billing/billing-calendar'
import { METHOD_LABEL, usePendingPayments } from '@/features/payments/api'
import { useBillsSince, useOpenBills, useRecentVerifiedPayments } from '@/features/reports/api'
import { type RoomOverview, useRoomOverview } from '@/features/rooms/api'
import { RoomMap, RoomMapLegend } from '@/features/rooms/room-map'
import { InviteTenantDialog } from '@/features/tenants/invite-tenant-dialog'
import { useTenants } from '@/features/tenants/api'
import { useProfile } from '@/hooks/use-auth'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { currentPeriod, nextBillingDates, shiftPeriod } from '@/lib/dates'
import { formatCompact, formatDate, formatMoney, formatPeriod, initials } from '@/lib/format'

const SERIES = [
  { name: 'Billed', color: 'var(--chart-1)' },
  { name: 'Collected', color: 'var(--chart-2)' },
]

interface Insight {
  key: string
  icon: LucideIcon
  title: string
  note: string
  to?: string
  trailing?: React.ReactNode
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

function CollectionsCard({ currency }: { currency: string }) {
  const [range, setRange] = useState<'6' | '12'>('6')
  const months = Number(range)
  // Always fetch 12 months so switching the range is instant.
  const from12 = shiftPeriod(currentPeriod(), -11)
  const { data, isPending, error, refetch } = useBillsSince(from12)

  const rows = useMemo(() => {
    const from = shiftPeriod(currentPeriod(), -(months - 1))
    const out = Array.from({ length: months }, (_, i) => ({ period: shiftPeriod(from, i), billed: 0, collected: 0 }))
    for (const b of data ?? []) {
      const row = out.find((r) => r.period === b.period)
      if (!row) continue
      row.billed += b.total_amount
      row.collected += b.amount_paid
    }
    return out
  }, [data, months])

  const billed = rows.reduce((t, r) => t + r.billed, 0)
  const collected = rows.reduce((t, r) => t + r.collected, 0)

  return (
    <Panel
      title="Collections analysis"
      description={
        billed > 0
          ? `${formatMoney(collected, currency)} collected of ${formatMoney(billed, currency)} billed · ${pct(collected, billed)}%`
          : `Billed vs collected, last ${months} months`
      }
      className="h-full"
      action={
        <Segmented
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: '6', label: '6 months' },
            { value: '12', label: '12 months' },
          ]}
        />
      }
    >
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-72" />
      ) : (
        <ColumnChart
          ariaLabel={`Billed and collected per month, last ${months} months`}
          series={SERIES}
          height={260}
          data={rows.map((r) => ({
            label: format(parseISO(r.period), months > 6 ? 'MMM' : 'MMMM'),
            title: formatPeriod(r.period),
            values: [r.billed, r.collected],
          }))}
          formatValue={(v) => formatMoney(v, currency)}
          formatTick={formatCompact}
        />
      )}
    </Panel>
  )
}

function RoomsCard({ rooms, currency }: { rooms: RoomOverview[]; currency: string }) {
  return (
    <Panel title="Room map" description="Select a room to open its tenant" className="h-full" action={<PanelLink to="/rooms">Manage rooms</PanelLink>}>
      <div className="space-y-4">
        <RoomMap rooms={rooms} currency={currency} />
        <RoomMapLegend />
      </div>
    </Panel>
  )
}

export function DashboardPage() {
  const period = currentPeriod()
  const lastPeriod = shiftPeriod(period, -1)
  const currency = useCurrency()
  const profile = useProfile()
  const settings = useSettings()
  const rooms = useRoomOverview()
  const monthBills = useBillsSince(lastPeriod)
  const open = useOpenBills()
  const pending = usePendingPayments()
  const sheet = useReadingSheet(period)
  const tenants = useTenants()
  const recent = useRecentVerifiedPayments()
  const [inviting, setInviting] = useState(false)

  const error = rooms.error ?? monthBills.error ?? open.error ?? pending.error
  const loading = rooms.isPending || monthBills.isPending || open.isPending || pending.isPending

  const stats = useMemo(() => {
    const r = rooms.data ?? []
    const all = monthBills.data ?? []
    const thisMonth = all.filter((b) => b.period === period)
    const prevMonth = all.filter((b) => b.period === lastPeriod)
    const openBills = open.data ?? []
    return {
      rooms: r.length,
      occupied: r.filter((x) => x.occupancy === 'occupied').length,
      unpriced: r.filter((x) => x.monthly_rent <= 0).length,
      billed: thisMonth.reduce((t, b) => t + b.total_amount, 0),
      collected: thisMonth.reduce((t, b) => t + b.amount_paid, 0),
      prevCollected: prevMonth.reduce((t, b) => t + b.amount_paid, 0),
      billsThisMonth: thisMonth.length,
      outstanding: openBills.reduce((t, b) => t + b.balance, 0),
      overdueBills: openBills.filter((b) => b.is_overdue),
    }
  }, [rooms.data, monthBills.data, open.data, period, lastPeriod])

  const overdueByTenant = useMemo(() => {
    const map = new Map<string, { id: string; name: string; room: string; amount: number; oldest: string }>()
    for (const b of stats.overdueBills) {
      const cur = map.get(b.tenant_id)
      if (cur) {
        cur.amount += b.balance
        if (b.due_date < cur.oldest) cur.oldest = b.due_date
      } else {
        map.set(b.tenant_id, { id: b.tenant_id, name: b.tenant_name, room: b.room_number, amount: b.balance, oldest: b.due_date })
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
  }, [stats.overdueBills])

  const s = settings.data
  const next = s ? nextBillingDates(s.billing_day, s.due_days) : null
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
  if (stats.occupied > 0 && stats.billsThisMonth < stats.occupied && (pastBillingDay || stats.billsThisMonth === 0)) {
    insights.push({
      key: 'generate',
      icon: ReceiptText,
      title: stats.billsThisMonth === 0 ? `${formatPeriod(period)} bills not generated` : `${stats.occupied - stats.billsThisMonth} rooms without a bill`,
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
  if (stats.unpriced > 0) {
    insights.push({ key: 'rent', icon: Tags, title: `${stats.unpriced} ${stats.unpriced === 1 ? 'room has' : 'rooms have'} no rent`, note: 'Set a standard monthly rent', to: '/rooms' })
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
      note: stats.billed > 0 ? `${formatMoney(stats.collected, currency)} of ${formatMoney(stats.billed, currency)} this month` : 'Nothing billed this month yet',
      trailing: stats.billed > 0 ? <span className="tabular">{pct(stats.collected, stats.billed)}%</span> : undefined,
    },
    {
      key: 'occupancy',
      icon: Building2,
      title: 'Occupancy',
      note: `${stats.occupied} of ${stats.rooms} rooms let`,
      trailing: <span className="tabular">{pct(stats.occupied, stats.rooms)}%</span>,
    },
    {
      key: 'next',
      icon: CalendarClock,
      title: 'Next billing run',
      note: next ? `Issued ${format(next.issue, 'EEE, MMM d')} · due ${format(next.due, 'MMM d')}` : 'Loading schedule…',
    },
  ]
  const insightRows = [...insights, ...standing].slice(0, Math.max(4, insights.length))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Property overview"
        description={`${greeting()}, ${profile.full_name.split(' ')[0] || 'there'}. Here’s ${format(new Date(), 'MMMM')} at a glance.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/billing/readings?period=${period}`}>
                <Gauge /> Meter readings
              </Link>
            </Button>
            <Button onClick={() => setInviting(true)}>
              <UserPlus /> Invite tenant
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => (rooms.refetch(), monthBills.refetch(), open.refetch(), pending.refetch())} />
      ) : loading ? (
        <div className="space-y-4">
          <StatGrid>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </StatGrid>
          <div className="grid gap-4 xl:grid-cols-12">
            <Skeleton className="h-96 rounded-xl xl:col-span-8" />
            <Skeleton className="h-96 rounded-xl xl:col-span-4" />
          </div>
        </div>
      ) : (
        <>
          <StatGrid>
            <StatTile
              label="Total rooms"
              value={String(stats.rooms)}
              icon={Building2}
              accent="violet"
              to="/rooms"
              sub={<span className="text-xs text-muted-foreground">{stats.occupied} occupied · {pct(stats.occupied, stats.rooms)}%</span>}
            />
            <StatTile
              label="Collected this month"
              value={formatMoney(stats.collected, currency)}
              icon={Wallet}
              accent="green"
              to="/reports"
              sub={<Trend current={stats.collected} previous={stats.prevCollected} label="vs last month" />}
            />
            <StatTile
              label="Outstanding"
              value={formatMoney(stats.outstanding, currency)}
              icon={AlertTriangle}
              accent="amber"
              to="/reports"
              sub={
                <span className={stats.overdueBills.length ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                  {stats.overdueBills.length ? `${stats.overdueBills.length} overdue` : 'Nothing overdue'}
                </span>
              }
            />
            <StatTile
              label="To verify"
              value={String(toVerify)}
              icon={Inbox}
              accent="blue"
              to="/payments"
              sub={<span className="text-xs text-muted-foreground">{toVerify ? 'Payment proofs waiting' : 'All caught up'}</span>}
            />
          </StatGrid>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <CollectionsCard currency={currency} />
            </div>

            <Panel
              title="Insights"
              className="xl:col-span-4"
              action={insights.length > 0 ? <StatusPill tone="destructive">{insights.length} to do</StatusPill> : <StatusPill tone="success">All caught up</StatusPill>}
            >
              <ul className="space-y-2">
                {insightRows.map((t) => (
                  <li key={t.key}>
                    <InsightRow icon={t.icon} title={t.title} note={t.note} to={t.to} trailing={t.trailing} />
                  </li>
                ))}
              </ul>
            </Panel>

            <div className="xl:col-span-8">
              <RoomsCard rooms={rooms.data ?? []} currency={currency} />
            </div>

            <Panel title="Billing calendar" className="xl:col-span-4">
              {s ? <BillingCalendar billingDay={s.billing_day} dueDays={s.due_days} /> : <Skeleton className="h-72" />}
            </Panel>

            <Panel
              title="Recent payments"
              flush
              className="xl:col-span-8"
              action={<PanelLink to="/payments?tab=history">View all</PanelLink>}
            >
              {recent.isPending ? (
                <Skeleton className="mx-5 mb-5 h-40" />
              ) : !recent.data?.length ? (
                <p className="px-5 pb-5 text-[13px] text-muted-foreground">No verified payments yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Tenant</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="hidden pr-5 md:table-cell">Paid on</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.data.slice(0, 5).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="pl-5">
                          <span className="flex items-center gap-3">
                            <InitialsBadge text={initials(p.tenant_name)} />
                            <span className="min-w-0">
                              <span className="block max-w-44 truncate font-semibold">{p.tenant_name}</span>
                              <span className="block text-xs text-muted-foreground">Room {p.room_number}</span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusPill tone="success">Verified</StatusPill>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{METHOD_LABEL[p.method]}</TableCell>
                        <TableCell className="text-right font-semibold tabular">{formatMoney(p.amount, currency)}</TableCell>
                        <TableCell className="hidden pr-5 text-muted-foreground md:table-cell">{formatDate(p.paid_on, 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>

            <Panel title="Overdue balances" className="xl:col-span-4" action={<PanelLink to="/reports">View all</PanelLink>}>
              {overdueByTenant.length === 0 ? (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" aria-hidden /> No overdue balances.
                </p>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {overdueByTenant.map((t) => (
                    <li key={t.id}>
                      <Link to={`/tenants/${t.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                        <InitialsBadge text={initials(t.name)} className="bg-destructive/10 text-destructive" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Room {t.room} · since {formatDate(t.oldest, 'MMM d')}
                          </span>
                        </span>
                        <span className="text-[13px] font-semibold text-destructive tabular">{formatMoney(t.amount, currency)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}

      <InviteTenantDialog open={inviting} onOpenChange={setInviting} />
    </div>
  )
}
