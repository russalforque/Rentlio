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
import { Callout, Panel, PanelLink } from '@/components/app/panel'
import { PageHeader } from '@/components/app/page-header'
import { ColumnChart } from '@/components/app/column-chart'
import type { CalendarMark } from '@/components/app/month-calendar'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { BillOverview } from '@/features/billing/api'
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

/** What makes up the consolidated bill: one tile per charge type, with what is still owed on it. */
function BillBreakdown({ bill, currency }: { bill: BillOverview; currency: string }) {
  const rows: [Enums<'bill_item_kind'>, number, number][] = [
    ['rent', bill.rent_amount, bill.rent_paid],
    ['electricity', bill.electricity_amount, bill.electricity_paid],
    ['water', bill.water_amount, bill.water_paid],
    ['other', bill.other_amount, bill.other_paid],
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {rows
        .filter(([kind, amount]) => kind !== 'other' || amount > 0)
        .map(([kind, amount, paid]) => {
          const { icon: Icon, label } = KIND[kind]
          return (
            <div key={kind} className="rounded-xl border px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Icon className="size-3.5" aria-hidden /> {label}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold tabular">{formatMoney(amount, currency)}</dd>
              <dd className={cn('text-[11px] tabular', paid >= amount && amount > 0 ? 'text-success' : 'text-muted-foreground')}>
                {amount === 0 ? 'Not charged' : paid >= amount ? 'Paid' : paid > 0 ? `${formatMoney(amount - paid, currency)} left` : 'Unpaid'}
              </dd>
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
        eyebrow={format(new Date(), 'EEEE, MMMM d')}
        title={`${greeting()}, ${profile.full_name.split(' ')[0] || 'there'}`}
        description={
          room ? (
            <Link to="/my/room" className="inline-flex items-center gap-1.5 font-medium text-foreground/80 hover:text-foreground">
              <DoorOpen className="size-3.5" aria-hidden />
              Room {room.rooms?.room_number}
              <span className="font-normal text-muted-foreground">· {settings?.property_name ?? 'Your rental'}</span>
            </Link>
          ) : (
            settings?.property_name ?? 'Your rental'
          )
        }
      />

      {recentRejections.map((p) => (
        <Callout key={p.id} role="alert" tone="destructive" icon={AlertTriangle}>
          Your payment of <b className="tabular">{formatMoney(p.amount, currency)}</b> for {formatPeriod(p.period)} was not
          accepted: <span className="italic">{p.rejection_reason}</span>. Please submit it again.
        </Callout>
      ))}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Amount due: the one thing a tenant comes here for */}
        <section
          aria-label="Amount due"
          className={cn('surface order-1 flex flex-col p-5 sm:p-6 md:col-span-2 xl:col-span-8', !(totalDue > 0 || bills.isPending) && 'border-success/30')}
        >
          {bills.isPending ? (
            <Skeleton className="h-48" />
          ) : totalDue > 0 && nextBill && due ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  Amount due <BillStatusBadge status={nextBill.status} overdue={nextBill.is_overdue} />
                </h2>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                    due.urgent ? 'bg-destructive/8 text-destructive ring-destructive/20' : 'bg-muted text-foreground ring-border',
                  )}
                >
                  <CalendarDays className="size-3.5" aria-hidden />
                  {due.text}
                </span>
              </div>
              <p className="font-display mt-2 text-[40px] leading-none font-semibold tabular break-all sm:text-[48px]">
                {formatMoney(totalDue, currency)}
              </p>
              <p className="mt-2.5 text-sm text-muted-foreground md:text-[13px]">
                {open.length > 1 ? `Across ${open.length} open bills · oldest is ` : 'For your '}
                <span className="font-semibold text-foreground">{formatPeriod(nextBill.period)}</span> bill · due{' '}
                <span className="font-semibold text-foreground">{formatDate(nextBill.due_date, 'MMM d')}</span>
              </p>
              <div className="mt-5 grid gap-2 sm:flex sm:flex-row">
                <Button size="lg" className="h-13 text-base sm:h-11 sm:text-sm" onClick={() => setPaying(true)}>
                  <Wallet /> Pay {formatPeriod(nextBill.period)}
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to={`/my/bills/${nextBill.id}`}>
                    <ReceiptText /> View bill
                  </Link>
                </Button>
              </div>
              {pending.length > 0 && (
                <p role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-info/8 px-3 py-2.5 text-[13px] text-info">
                  <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {formatMoney(pending.reduce((t, p) => t + p.amount, 0), currency)} sent, waiting for your landlord to verify
                </p>
              )}
              <div className="mt-5 border-t pt-4">
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">What you're paying for</p>
                <BillBreakdown bill={nextBill} currency={currency} />
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

        {/* My room */}
        <Panel title="My room" className="order-3 xl:order-2 xl:col-span-4" action={<PanelLink to="/my/room">Details</PanelLink>}>
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
                <div className="min-w-0 rounded-xl border px-3 py-2.5">
                  <dt className="text-xs font-medium text-muted-foreground">Monthly rent</dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold tabular">{formatMoney(room.monthly_rent, currency)}</dd>
                </div>
                <div className="min-w-0 rounded-xl border px-3 py-2.5">
                  <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <PiggyBank className="size-3.5" aria-hidden /> Deposit held
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold tabular">{formatMoney(deposit.data ?? 0, currency)}</dd>
                </div>
              </dl>
              {settings && <p className="mt-3 text-xs text-muted-foreground">Bills are due {settings.due_days} days after they are issued.</p>}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">You are not assigned to a room right now.</p>
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
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
              <div className="hidden sm:block">
                <ColumnChart
                  ariaLabel="Total billed per month"
                  series={[{ name: 'Total billed', color: 'var(--chart-1)' }]}
                  data={history}
                  height={200}
                  formatValue={(v) => formatMoney(v, currency)}
                  formatTick={formatCompact}
                />
              </div>
              <ul className="divide-y self-start">
                {(bills.data ?? []).slice(0, 4).map((b) => (
                  <li key={b.id}>
                    <Link to={`/my/bills/${b.id}`} className="-mx-2 flex min-h-14 items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60">
                      <span>
                        <span className="block text-sm font-semibold md:text-[13px]">{formatPeriod(b.period)}</span>
                        <BillStatusBadge status={b.status} overdue={b.is_overdue} className="mt-1" />
                      </span>
                      <span className="text-sm font-semibold tabular md:text-[13px]">{formatMoney(b.total_amount, currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* Calendar */}
        <Panel title="Billing calendar" className="order-5 xl:order-4 xl:col-span-4">
          {settings ? (
            <BillingCalendar billingDay={settings.billing_day} dueDays={settings.due_days} extra={calendarMarks} />
          ) : (
            <Skeleton className="h-72" />
          )}
        </Panel>

        {/* Payments */}
        <Panel title="Recent payments" className="order-2 xl:order-5 xl:col-span-6" action={<PanelLink to="/my/payments">View all</PanelLink>}>
          {payments.isPending ? (
            <Skeleton className="h-32" />
          ) : !payments.data?.length ? (
            <p className="text-[13px] text-muted-foreground">Payments you send will show up here.</p>
          ) : (
            <ul className="divide-y">
              {payments.data.slice(0, 3).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border" aria-hidden>
                    <Wallet className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold md:text-[13px]">{formatPeriod(p.period)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {METHOD_LABEL[p.method]} · {formatDate(p.paid_on, 'MMM d')}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular md:text-[13px]">{formatMoney(p.amount, currency)}</span>
                    {p.status === 'verified' ? (
                      <Link to={`/receipts/${p.id}`} className="text-xs font-medium text-success underline-offset-2 hover:underline">
                        Receipt
                      </Link>
                    ) : (
                      <PaymentStatusBadge status={p.status} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* How to pay */}
        <Panel title="How to pay" className="order-6 xl:col-span-6">
          {settings?.payment_instructions ? (
            <p className="text-sm leading-relaxed whitespace-pre-line md:text-[13px]">{settings.payment_instructions}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">Your landlord has not added payment instructions yet.</p>
          )}
          {(settings?.contact_phone || settings?.contact_email) && (
            <div className="mt-auto grid gap-2 pt-5 sm:flex sm:flex-wrap">
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
