import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  DoorOpen,
  Droplets,
  Hourglass,
  type LucideIcon,
  Mail,
  Phone,
  PiggyBank,
  Plus,
  ReceiptText,
  Wallet,
  Zap,
  Home as HomeIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Callout, Panel, PanelLink, StatGrid, StatTile } from '@/components/app/panel'
import { PageHeader } from '@/components/app/page-header'
import { ColumnChart } from '@/components/app/column-chart'
import type { CalendarMark } from '@/components/app/month-calendar'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { type BillOverview, useBillItems } from '@/features/billing/api'
import { BillingCalendar } from '@/features/billing/billing-calendar'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { METHOD_LABEL, useMyPayments } from '@/features/payments/api'
import { PaymentStatusBadge } from '@/features/payments/components'
import { SubmitPaymentDialog } from '@/features/payments/payment-dialogs'
import { useMyBills, useMyDepositBalance, useMyTenancy } from '@/features/portal/api'
import { useProfile } from '@/hooks/use-auth'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import type { Enums } from '@/lib/database.types'
import { formatCompact, formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function dueLabel(dueDate: string): { text: string; urgent: boolean } {
  const days = differenceInCalendarDays(parseISO(dueDate), new Date())
  if (days < 0) return { text: `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`, urgent: true }
  if (days === 0) return { text: 'Due today', urgent: true }
  if (days <= 3) return { text: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, urgent: true }
  return { text: `Due ${formatDate(dueDate)}`, urgent: false }
}

const KIND: Record<Enums<'bill_item_kind'>, { icon: LucideIcon; label: string }> = {
  rent: { icon: HomeIcon, label: 'Rent' },
  electricity: { icon: Zap, label: 'Electricity' },
  water: { icon: Droplets, label: 'Water' },
  other: { icon: Plus, label: 'Other' },
}

/** What makes up the bill being paid: one compact tile per charge type. */
function BillBreakdown({ bill, currency }: { bill: BillOverview; currency: string }) {
  const { data, isPending } = useBillItems(bill.id)
  if (isPending) return <Skeleton className="h-16 rounded-xl" />
  if (!data?.length) return null
  const byKind = new Map<Enums<'bill_item_kind'>, number>()
  for (const item of data) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + item.amount)
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[...byKind].map(([kind, amount]) => {
        const { icon: Icon, label } = KIND[kind]
        return (
          <div key={kind} className="rounded-xl border px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Icon className="size-3.5" aria-hidden /> {label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular">{formatMoney(amount, currency)}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export function TenantHomePage() {
  const profile = useProfile()
  const currency = useCurrency()
  const { data: settings } = useSettings()
  const bills = useMyBills()
  const tenancy = useMyTenancy()
  const payments = useMyPayments()
  const deposit = useMyDepositBalance()
  const [paying, setPaying] = useState(false)

  const history = useMemo(
    () =>
      [...(bills.data ?? [])]
        .slice(0, 6)
        .reverse()
        .map((b) => ({ label: format(parseISO(b.period), 'MMM'), title: formatPeriod(b.period), values: [b.total_amount] })),
    [bills.data],
  )

  if (bills.error || tenancy.error) {
    return <ErrorState error={bills.error ?? tenancy.error} onRetry={() => (bills.refetch(), tenancy.refetch())} />
  }

  const open = (bills.data ?? []).filter((b) => b.status === 'unpaid' || b.status === 'partial')
  const totalDue = open.reduce((t, b) => t + b.balance, 0)
  // Pay the oldest open bill first.
  const nextBill = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  const pending = (payments.data ?? []).filter((p) => p.status === 'pending')
  const recentRejections = (payments.data ?? []).filter(
    (p) => p.status === 'rejected' && p.reviewed_at && differenceInCalendarDays(new Date(), parseISO(p.reviewed_at)) <= 30,
  )
  const latest = bills.data?.[0]
  const room = tenancy.data?.current
  const due = nextBill ? dueLabel(nextBill.due_date) : null

  // The tenant's own open bills on the calendar, overdue ones called out.
  const calendarMarks = new Map<string, CalendarMark>(
    open.map((b) => [
      b.due_date,
      b.is_overdue
        ? { kind: 'overdue', label: `${formatPeriod(b.period)} bill overdue` }
        : { kind: 'due', label: `${formatPeriod(b.period)} bill due` },
    ]),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}, ${profile.full_name.split(' ')[0] || 'there'}`}
        description={`${format(new Date(), 'EEEE, MMMM d')} · ${settings?.property_name ?? 'Your rental'}`}
      />

      {recentRejections.map((p) => (
        <Callout key={p.id} role="alert" tone="destructive" icon={AlertTriangle}>
          Your payment of <b className="tabular">{formatMoney(p.amount, currency)}</b> for {formatPeriod(p.period)} was not
          accepted: <span className="italic">{p.rejection_reason}</span>. Please submit it again.
        </Callout>
      ))}

      <StatGrid>
        <StatTile
          label="Amount due"
          value={bills.isPending ? '—' : formatMoney(totalDue, currency)}
          icon={Wallet}
          accent="amber"
          sub={
            due ? (
              <span className={cn('text-xs', due.urgent ? 'font-medium text-destructive' : 'text-muted-foreground')}>{due.text}</span>
            ) : (
              <span className="text-xs font-medium text-success">All paid up</span>
            )
          }
        />
        <StatTile
          label="Open bills"
          value={String(open.length)}
          icon={ReceiptText}
          accent="violet"
          to="/my/bills"
          sub={<span className="text-xs text-muted-foreground">{pending.length ? `${pending.length} payment awaiting check` : 'Nothing pending'}</span>}
        />
        <StatTile
          label="Monthly rent"
          value={room ? formatMoney(room.monthly_rent, currency) : '—'}
          icon={DoorOpen}
          accent="blue"
          to="/my/room"
          sub={<span className="text-xs text-muted-foreground">{room ? `Room ${room.rooms?.room_number}` : 'No room yet'}</span>}
        />
        <StatTile
          label="Security deposit"
          value={formatMoney(deposit.data ?? 0, currency)}
          icon={PiggyBank}
          accent="green"
          sub={<span className="text-xs text-muted-foreground">Held by your landlord</span>}
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Amount due: the one thing a tenant comes here for */}
        <section
          aria-label="Amount due"
          className={cn('surface order-1 flex flex-col p-5 md:col-span-2 xl:col-span-8', !(totalDue > 0 || bills.isPending) && 'border-success/30')}
        >
          {bills.isPending ? (
            <Skeleton className="h-48" />
          ) : totalDue > 0 && nextBill && due ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-[15px] font-semibold">Next payment</h2>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                    due.urgent ? 'bg-destructive/8 text-destructive ring-destructive/20' : 'bg-muted text-foreground ring-border',
                  )}
                >
                  <CalendarDays className="size-3.5" aria-hidden />
                  {due.text}
                </span>
              </div>
              <p className="font-display mt-3 text-4xl font-semibold tabular sm:text-[44px]">{formatMoney(totalDue, currency)}</p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {open.length > 1 ? `Across ${open.length} open bills · oldest is ` : 'For your '}
                <span className="font-semibold text-foreground">{formatPeriod(nextBill.period)}</span> bill
              </p>
              {pending.length > 0 && (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-info/8 px-3 py-2 text-[13px] text-info">
                  <Hourglass className="size-4 shrink-0" aria-hidden />
                  {formatMoney(pending.reduce((t, p) => t + p.amount, 0), currency)} sent, waiting for your landlord to verify
                </p>
              )}
              <div className="mt-5">
                <BillBreakdown bill={nextBill} currency={currency} />
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:mt-auto sm:flex-row sm:pt-5">
                <Button size="lg" onClick={() => setPaying(true)}>
                  <Wallet /> Pay {formatPeriod(nextBill.period)}
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to={`/my/bills/${nextBill.id}`}>See full breakdown</Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center gap-4 py-4">
              <CheckCircle2 className="size-12 shrink-0 text-success" aria-hidden />
              <div>
                <p className="text-lg font-semibold">You're all paid up</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {pending.length > 0
                    ? 'A payment you sent is waiting for verification.'
                    : latest
                      ? `Your next bill will appear around day ${settings?.billing_day ?? 1} of the month.`
                      : 'Your bills will appear here once your landlord issues them.'}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Calendar */}
        <Panel title="Billing calendar" className="order-2 xl:col-span-4">
          {settings ? (
            <BillingCalendar billingDay={settings.billing_day} dueDays={settings.due_days} extra={calendarMarks} />
          ) : (
            <Skeleton className="h-72" />
          )}
        </Panel>

        {/* Bill history */}
        <Panel
          title="Your bills"
          description="Total billed per month"
          className="order-4 md:col-span-2 xl:order-3 xl:col-span-8"
          action={<PanelLink to="/my/bills">View all</PanelLink>}
        >
          {bills.isPending ? (
            <Skeleton className="h-56" />
          ) : history.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No bills yet.</p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
              <ColumnChart
                ariaLabel="Total billed per month"
                series={[{ name: 'Total billed', color: 'var(--chart-1)' }]}
                data={history}
                height={200}
                formatValue={(v) => formatMoney(v, currency)}
                formatTick={formatCompact}
              />
              <ul className="divide-y self-start">
                {(bills.data ?? []).slice(0, 4).map((b) => (
                  <li key={b.id}>
                    <Link to={`/my/bills/${b.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60">
                      <span>
                        <span className="block text-[13px] font-semibold">{format(parseISO(b.period), 'MMMM')}</span>
                        <BillStatusBadge status={b.status} overdue={b.is_overdue} className="mt-0.5" />
                      </span>
                      <span className="text-[13px] font-semibold tabular">{formatMoney(b.total_amount, currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* My room */}
        <Panel title="My room" className="order-3 xl:order-4 xl:col-span-4" action={<PanelLink to="/my/room">Details</PanelLink>}>
          {tenancy.isPending ? (
            <Skeleton className="h-32" />
          ) : room ? (
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground tabular">
                  {room.rooms?.room_number}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">Room {room.rooms?.room_number}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {room.rooms?.floor ? `Floor ${room.rooms.floor} · ` : ''}since {formatDate(room.start_date)}
                  </p>
                </div>
              </div>
              <dl className="mt-auto grid grid-cols-2 gap-2 pt-5">
                <div className="rounded-xl border px-3 py-2.5">
                  <dt className="text-[11px] font-medium text-muted-foreground">Monthly rent</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular">{formatMoney(room.monthly_rent, currency)}</dd>
                </div>
                <div className="rounded-xl border px-3 py-2.5">
                  <dt className="text-[11px] font-medium text-muted-foreground">Bills due</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {settings ? `${settings.due_days} days after issue` : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">You are not assigned to a room right now.</p>
          )}
        </Panel>

        {/* Payments */}
        <Panel title="Recent payments" className="order-5 xl:col-span-6" action={<PanelLink to="/my/payments">View all</PanelLink>}>
          {payments.isPending ? (
            <Skeleton className="h-32" />
          ) : !payments.data?.length ? (
            <p className="text-[13px] text-muted-foreground">Payments you send will show up here.</p>
          ) : (
            <ul className="divide-y">
              {payments.data.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border" aria-hidden>
                    <Wallet className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{formatPeriod(p.period)}</span>
                    <span className="text-xs text-muted-foreground">
                      {METHOD_LABEL[p.method]} · {formatDate(p.paid_on, 'MMM d')}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-[13px] font-semibold tabular">{formatMoney(p.amount, currency)}</span>
                    <PaymentStatusBadge status={p.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* How to pay */}
        <Panel title="How to pay" className="order-6 xl:col-span-6">
          {settings?.payment_instructions ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-line">{settings.payment_instructions}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">Your landlord has not added payment instructions yet.</p>
          )}
          {(settings?.contact_phone || settings?.contact_email) && (
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              {settings.contact_phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${settings.contact_phone}`}>
                    <Phone /> {settings.contact_phone}
                  </a>
                </Button>
              )}
              {settings.contact_email && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${settings.contact_email}`}>
                    <Mail /> Email landlord
                  </a>
                </Button>
              )}
            </div>
          )}
        </Panel>
      </div>

      {nextBill && <SubmitPaymentDialog bill={nextBill} open={paying} onOpenChange={setPaying} />}
    </div>
  )
}
