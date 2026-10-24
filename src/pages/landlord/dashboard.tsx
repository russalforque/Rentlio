import { Building2, CalendarDays, ChevronRight, Gauge, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { RecordPaymentButton } from '@/features/payments/record-payment-button'
import { CashOverview } from '@/features/finances/cash-overview'
import { PageHeader } from '@/components/app/page-header'
import { Panel, PanelLink, StatGridSkeleton } from '@/components/app/panel'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBills, useReadingSheet } from '@/features/billing/api'
import { CollectionsCard } from '@/features/dashboard/collections-card'
import { ActionCenter } from '@/features/dashboard/action-center'
import { KpiStrip } from '@/features/dashboard/kpi-strip'
import { countOccupancy, useMonthlyTotals } from '@/features/dashboard/metrics'
import { OccupancyCard } from '@/features/dashboard/occupancy-card'
import { RevenueCard } from '@/features/dashboard/revenue-card'
import { TransactionsCard } from '@/features/dashboard/transactions-card'
import { WatchlistCard } from '@/features/dashboard/watchlist-card'
import { usePendingPayments } from '@/features/payments/api'
import { useOpenBills } from '@/features/reports/api'
import { useRoomOverview } from '@/features/rooms/api'
import { usePendingRegistrationCount } from '@/features/registrations/api'
import { AddTenantDialog } from '@/features/tenants/add-tenant-dialog'
import { useTenants } from '@/features/tenants/api'
import { useProfile } from '@/hooks/use-auth'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { currentPeriod, nextLeaseDueDate, todayISO } from '@/lib/dates'
import { formatDate } from '@/lib/format'
import './dashboard.css'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
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
  const meterReadingFields = {
    aircon: { previous: 'aircon_previous', current: 'aircon_current' },
    outlet: { previous: 'outlet_previous', current: 'outlet_current' },
    light: { previous: 'light_previous', current: 'light_current' },
  } as const
  const monthBills = useBills(period)
  const tenants = useTenants()
  const registrations = usePendingRegistrationCount()
  const [inviting, setInviting] = useState(false)

  // The Action Center reads every one of these, so it cannot claim "all caught up" until all have
  // loaded. They run in parallel, so waiting on all of them costs only the slowest.
  const queries = [settings, rooms, history, open, pending, sheet, tenants, monthBills, registrations]
  const failed = queries.filter((q) => q.error)
  const error = failed.at(0)?.error
  const loading = queries.some((q) => q.isPending)

  const s = settings.data
  const roomList = rooms.data ?? []
  const occupancy = countOccupancy(roomList)
  const today = todayISO(new Date(), s?.timezone)
  const leaseDues = roomList
    .filter((room) => room.occupancy === 'occupied' && room.lease_start_date)
    .flatMap((room) =>
      room.lease_start_date
        ? [{ room: room.room_number, tenant: room.tenant_name, due: nextLeaseDueDate(room.lease_start_date, today) }]
        : [],
    )
    .sort((a, b) => a.due.localeCompare(b.due))
  const nextDue = leaseDues[0]?.due ?? null
  const firstName = profile.full_name.trim().split(' ')[0]
  const drafts = (monthBills.data ?? []).filter((b) => b.status !== 'void' && !b.is_finalized)

  return (
    <div className="landlord-dashboard @container space-y-6">
      <PageHeader
        eyebrow={
          <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
            <Building2 className="size-3.5 shrink-0" aria-hidden />
            <span className="max-w-64 truncate">{s?.property_name || 'Your property'}</span>
            <ChevronRight className="size-3 shrink-0" aria-hidden />
            <span>Overview</span>
          </span>
        }
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description="Your property at a glance. Keep the day moving."
        actions={
          <div className="dashboard-actions">
            <RecordPaymentButton className="dashboard-record-payment" />
            <Button variant="outline" className="bg-card" asChild>
              <Link to={`/billing/readings?period=${period}`}>
                <Gauge /> Meter readings
              </Link>
            </Button>
            <Button variant="outline" className="bg-card" onClick={() => setInviting(true)}>
              <UserPlus /> Add tenant
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => failed.forEach((q) => q.refetch())} />
      ) : loading || !s ? (
        <div className="space-y-4" role="status" aria-label="Loading dashboard" aria-busy>
          <StatGridSkeleton />
          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-12">
            <Skeleton className="h-96 rounded-xl @4xl:col-span-8" />
            <Skeleton className="h-96 rounded-xl @4xl:col-span-4" />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Monthly overview</h2>
            <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium">
              <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
              {formatDate(period, 'MMMM yyyy')}
            </span>
          </div>
          <KpiStrip months={history.months} occupancy={occupancy} open={open.data ?? []} pending={pending.data ?? []} currency={currency} />

          <div className="dashboard-layout">
            <div className="dashboard-priorities">
              <ActionCenter
                className="dashboard-attention"
                input={{
                  period,
                  today,
                  nextDue,
                  rooms: roomList,
                  billedLeases: new Set((history.data ?? []).flatMap((b) => (b.period === period && b.lease_id ? [b.lease_id] : []))),
                  pendingCount: pending.data?.length ?? 0,
                  missingReadings: (sheet.data ?? []).filter(
                    (r) =>
                      r.is_billable &&
                      r.electricity_meters.length > 0 &&
                      r.electricity_meters.some(
                        (meter) => {
                          const fields = meterReadingFields[meter]
                          return r[fields.previous] === null || r[fields.current] === null
                        },
                      ),
                  ).length,
                  invitedTenants: (tenants.data ?? []).filter((t) => t.account_status === 'invited').length,
                  pendingRegistrations: registrations.data ?? 0,
                  draftBills: drafts.length,
                  readyDrafts: drafts.filter((b) => b.missing_charges.length === 0).length,
                  thisMonth: history.months.at(-1),
                  currency,
                }}
              />
              <WatchlistCard bills={open.data ?? []} currency={currency} className="dashboard-watchlist" />
              <CashOverview className="dashboard-cash" />
              <Panel
                title="Upcoming rent"
                description="Based on each tenant's move-in date."
                className="dashboard-rent"
                action={<PanelLink to="/tenants">All tenants</PanelLink>}
              >
                {leaseDues.length ? (
                  <ul className="divide-y">
                    {leaseDues.slice(0, 5).map((lease) => (
                      <li key={lease.room} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-xs font-semibold tabular" aria-hidden>{lease.room}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{lease.tenant ?? 'Tenant'}</span>
                          <span className="block truncate text-xs text-muted-foreground">Room {lease.room}</span>
                        </span>
                        <time dateTime={lease.due} className="shrink-0 rounded-md bg-muted/60 px-2 py-1.5 text-xs font-medium tabular">
                          {lease.due === today ? 'Today' : formatDate(lease.due, 'MMM d')}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed px-4 py-5 text-center">
                    <CalendarDays className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">No upcoming rent yet</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Active rental agreements will appear here.</p>
                  </div>
                )}
              </Panel>
            </div>
            <div className="dashboard-performance">
              <CollectionsCard
                period={period}
                bills={monthBills.data ?? []}
                currency={currency}
                className="dashboard-collections"
              />
              <TransactionsCard currency={currency} className="dashboard-transactions" />
              <RevenueCard months={history.months} currency={currency} className="dashboard-revenue" />
              <OccupancyCard rooms={roomList} occupancy={occupancy} currency={currency} className="dashboard-occupancy" />
            </div>
          </div>
        </>
      )}

      <AddTenantDialog open={inviting} onOpenChange={setInviting} />
    </div>
  )
}
