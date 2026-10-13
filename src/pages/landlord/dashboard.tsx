import { format } from 'date-fns'
import { Building2, Gauge, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Fab } from '@/components/app/fab'
import { PageHeader } from '@/components/app/page-header'
import { Panel, StatGridSkeleton } from '@/components/app/panel'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBills, useReadingSheet } from '@/features/billing/api'
import { CollectionsCard } from '@/features/dashboard/collections-card'
import { BillingCalendar } from '@/features/billing/billing-calendar'
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
import { currentPeriod, nextBillingDates } from '@/lib/dates'

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
  const monthBills = useBills(period)
  const tenants = useTenants()
  const registrations = usePendingRegistrationCount()
  const [inviting, setInviting] = useState(false)

  // The Action Center reads every one of these, so it cannot claim "all caught up" until all have
  // loaded. They run in parallel, so waiting on all of them costs only the slowest.
  const queries = [settings, rooms, history, open, pending, sheet, tenants, monthBills]
  const failed = queries.filter((q) => q.error)
  const error = failed.at(0)?.error
  const loading = queries.some((q) => q.isPending)

  const s = settings.data
  const roomList = rooms.data ?? []
  const occupancy = countOccupancy(roomList)
  const next = s ? nextBillingDates(s.billing_day, s.due_days) : null
  const firstName = profile.full_name.trim().split(' ')[0]
  const drafts = (monthBills.data ?? []).filter((b) => b.status !== 'void' && !b.is_finalized)

  return (
    <div className="@container space-y-5">
      <PageHeader
        eyebrow={<span className="text-xs font-semibold tracking-wider uppercase">{format(new Date(), 'EEEE, MMMM d')}</span>}
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description={
          s?.property_name ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Building2 className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{s.property_name}</span>
              <span aria-hidden>·</span>
              <span className="shrink-0">{format(new Date(), 'MMMM')} overview</span>
            </span>
          ) : (
            `Here’s how ${format(new Date(), 'MMMM')} is going.`
          )
        }
        actions={
          // Phones: no header buttons. Add tenant is the floating button; readings sit under Billing.
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="outline" asChild>
              <Link to={`/billing/readings?period=${period}`}>
                <Gauge /> Meter readings
              </Link>
            </Button>
            <Button onClick={() => setInviting(true)}>
              <UserPlus /> Add tenant
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => failed.forEach((q) => q.refetch())} />
      ) : loading || !s || !next ? (
        <div className="space-y-4" aria-busy>
          <StatGridSkeleton />
          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-12">
            <Skeleton className="h-96 rounded-xl @4xl:col-span-8" />
            <Skeleton className="h-96 rounded-xl @4xl:col-span-4" />
          </div>
        </div>
      ) : (
        <>
          <KpiStrip months={history.months} occupancy={occupancy} open={open.data ?? []} pending={pending.data ?? []} currency={currency} />

          {/* Phones: what needs doing first, charts after. Large screens: an 8/4 grid. */}
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-12">
            <RevenueCard months={history.months} currency={currency} className="order-4 @xl:col-span-2 @4xl:order-1 @4xl:col-span-8" />

            <ActionCenter
              className="order-1 @4xl:order-2 @4xl:col-span-4"
              input={{
                period,
                today: new Date(),
                billingDay: s.billing_day,
                next,
                rooms: roomList,
                billedLeases: new Set((history.data ?? []).flatMap((b) => (b.period === period && b.lease_id ? [b.lease_id] : []))),
                pendingCount: pending.data?.length ?? 0,
                missingReadings: (sheet.data ?? []).filter((r) => r.is_billable && r.electricity_current === null).length,
                invitedTenants: (tenants.data ?? []).filter((t) => t.account_status === 'invited').length,
                pendingRegistrations: registrations.data ?? 0,
                draftBills: drafts.length,
                readyDrafts: drafts.filter((b) => b.missing_charges.length === 0).length,
                thisMonth: history.months.at(-1),
                currency,
              }}
            />

            <CollectionsCard
              period={period}
              bills={monthBills.data ?? []}
              currency={currency}
              className="order-2 @xl:col-span-2 @4xl:order-first @4xl:col-span-12"
            />

            <TransactionsCard currency={currency} className="order-3 @xl:col-span-2 @4xl:order-3 @4xl:col-span-8" />

            <WatchlistCard bills={open.data ?? []} currency={currency} className="order-2 @4xl:order-4 @4xl:col-span-4" />

            <OccupancyCard rooms={roomList} occupancy={occupancy} currency={currency} className="order-5 @xl:col-span-2 @4xl:order-5 @4xl:col-span-8" />

            <Panel
              title="Billing calendar"
              description={`Next bills ${format(next.issue, 'MMM d')}, due ${format(next.due, 'MMM d')}`}
              className="order-6 @xl:col-span-2 @4xl:order-6 @4xl:col-span-4"
            >
              <BillingCalendar billingDay={s.billing_day} dueDays={s.due_days} />
            </Panel>
          </div>
        </>
      )}

      <Fab icon={UserPlus} label="Add tenant" onClick={() => setInviting(true)} />
      <AddTenantDialog open={inviting} onOpenChange={setInviting} />
    </div>
  )
}
