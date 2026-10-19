import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight,
  DoorOpen, Droplets, Headphones, Hourglass, type LucideIcon, Mail, Phone, Plus,
  ReceiptText, ShieldCheck, Wallet, Zap, Home as HomeIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Callout, Panel, PanelLink } from '@/components/app/panel'
import { TenantPageHeader } from '@/components/app/tenant-page-header'
import { TenantIllustration } from '@/components/app/tenant-illustration'
import residenceIllustration from '@/assets/property_residence.png'
import calendarIllustration from '@/assets/Minimal Calendar, Clock, and Plant.png'
import noActivityIllustration from '@/assets/empty_no_activity.png'
import noPaymentsIllustration from '@/assets/empty_no_payments.png'
import { ColumnChart } from '@/components/app/column-chart'
import type { CalendarMark } from '@/components/app/month-calendar'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { BillOverview } from '@/features/billing/api'
import { BillingCalendar } from '@/features/billing/billing-calendar'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { METHOD_LABEL, useMyPayments } from '@/features/payments/api'
import { PaymentStatusBadge } from '@/features/payments/components'
import { useMyBills, useMyDepositBalance, useMyTenancy } from '@/features/portal/api'
import { useProfile } from '@/hooks/use-auth'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { nextLeaseDueDate, todayISO } from '@/lib/dates'
import type { Enums } from '@/lib/database.types'
import { formatCompact, formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'
import './home.css'

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

/** Remaining charges on the bill the payment action opens, after verified payments. */
function BillBreakdown({ bill, currency }: { bill: BillOverview; currency: string }) {
  const rows: [Enums<'bill_item_kind'>, number, number][] = [
    ['rent', bill.rent_amount, bill.rent_paid],
    ['electricity', bill.electricity_amount, bill.electricity_paid],
    ['water', bill.water_amount, bill.water_paid],
    ['other', bill.other_amount, bill.other_paid],
  ]
  return (
    <dl className={cn('home-breakdown grid grid-cols-2 gap-2', bill.other_amount > 0 ? '@md:grid-cols-4' : '@md:grid-cols-3')}>
      {rows.filter(([kind, amount]) => kind !== 'other' || amount > 0).map(([kind, amount, paid]) => {
        const { icon: Icon, label } = KIND[kind]
        return (
          <div key={kind} className="min-w-0 rounded-2xl bg-muted/65 p-3">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5 shrink-0" strokeWidth={1.7} aria-hidden /> {label}</dt>
            <dd className="mt-1.5 text-sm font-semibold tabular break-words">{formatMoney(Math.max(0, amount - paid), currency)}</dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">
              {amount === 0 ? 'Not charged' : paid >= amount ? 'Paid in full' : paid > 0 ? 'Partially paid' : 'Unpaid'}
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
  const settings = useSettings()
  const bills = useMyBills()
  const tenancy = useMyTenancy()
  const payments = useMyPayments()
  const deposit = useMyDepositBalance()

  const history = useMemo(
    () => [...(bills.data ?? [])].slice(0, 6).reverse().map((b) => ({
      label: format(parseISO(b.period), 'MMM'), title: formatPeriod(b.period), values: [b.total_amount],
    })),
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
  const today = todayISO(new Date(), settings.data?.timezone)
  const scheduleFrom = latest?.status === 'paid' && latest.due_date >= today
    ? format(addDays(parseISO(latest.due_date), 1), 'yyyy-MM-dd') : today
  const scheduledDue = room ? nextLeaseDueDate(room.start_date, scheduleFrom) : null
  const nextPaymentDue = nextBill?.due_date ?? scheduledDue
  const calendarMarks = new Map<string, CalendarMark>(open.map((b) => [
    b.due_date,
    b.is_overdue
      ? { kind: 'overdue', label: `${formatPeriod(b.period)} bill overdue` }
      : { kind: 'due', label: `${formatPeriod(b.period)} bill due` },
  ]))

  return (
    <div className="tenant-page tenant-home @container space-y-5 sm:space-y-6">
      <TenantPageHeader
        eyebrow={format(new Date(), 'EEEE, MMMM d')}
        title={`${greeting()}, ${profile.full_name.trim().split(/\s+/)[0] || 'there'}.`}
        description="Your home, bills and payments at a glance."
        actions={room && (
          <Link to="/my/room" className="home-room-link inline-flex size-11 max-w-full items-center justify-center gap-2 rounded-full bg-card text-xs font-semibold sm:w-auto sm:px-4">
            <DoorOpen className="size-4 shrink-0" aria-hidden /><span className="sr-only sm:not-sr-only sm:truncate">Room {room.rooms?.room_number}</span><ArrowUpRight className="hidden size-3.5 shrink-0 sm:block" aria-hidden />
          </Link>
        )}
      />

      {recentRejections.map((p) => (
        <Callout key={p.id} role="alert" tone="destructive" icon={AlertTriangle}
          action={<Button asChild variant="outline" size="sm"><Link to={`/my/bills/${p.bill_id}`}>Review bill <ArrowRight aria-hidden /></Link></Button>}>
          <p className="font-semibold">Payment not accepted · {formatMoney(p.amount, currency)}</p>
          <p className="mt-0.5 break-words">{formatPeriod(p.period)}: {p.rejection_reason || 'Please review this bill and submit your payment again.'}</p>
        </Callout>
      ))}
      {pending.length > 0 && (
        <Callout role="status" tone="info" icon={Hourglass}
          action={<Button asChild variant="ghost" size="sm"><Link to="/my/payments">View payments <ArrowRight aria-hidden /></Link></Button>}>
          <p className="font-semibold">{formatMoney(pending.reduce((t, p) => t + p.amount, 0), currency)} awaiting verification</p>
          <p className="mt-0.5">Your balance updates after your landlord verifies {pending.length === 1 ? 'this payment' : 'these payments'}.</p>
        </Callout>
      )}

      <div className="home-bento grid min-w-0 grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(18rem,.7fr)] @6xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="@container min-w-0 space-y-5">
          <section aria-labelledby="balance-heading" aria-busy={bills.isPending} className="home-balance surface min-w-0 overflow-hidden">
            {bills.isPending ? (
              <div role="status" className="space-y-4 p-5 sm:p-6">
                <h2 id="balance-heading" className="sr-only">Loading your balance</h2>
                <Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-48 max-w-full" />
                <Skeleton className="h-12" /><Skeleton className="h-24" />
              </div>
            ) : totalDue > 0 && nextBill && due ? (
              <>
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="balance-heading" className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground"><Wallet className="size-4" strokeWidth={1.7} aria-hidden />Outstanding balance</h2>
                    <span className={cn('home-due-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold', due.urgent ? 'bg-destructive/8 text-destructive' : 'bg-muted text-muted-foreground')}>
                      <CalendarDays className="size-3.5" aria-hidden />{due.text}
                    </span>
                  </div>
                  <p className="home-balance-amount font-display mt-5 font-semibold tabular break-words">{formatMoney(totalDue, currency)}</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">{open.length === 1 ? '1 open bill' : `${open.length} open bills · oldest bill first`}</p>
                  <div className="home-current-bill mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/65 p-4">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{open.length > 1 ? 'Paying next' : 'Current bill'}</p>
                      <h3 className="mt-1 text-sm font-semibold">{formatPeriod(nextBill.period)}</h3>
                    </div>
                    <p className="text-right text-[11px] text-muted-foreground"><span className="mb-1 block text-sm font-semibold text-foreground tabular break-words">{formatMoney(nextBill.balance, currency)}</span>remaining</p>
                  </div>
                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
                    <Button asChild size="lg" className="home-primary justify-between"><Link to={`/my/pay-online?bill=${nextBill.id}`}><span className="flex items-center gap-2"><Wallet className="size-4" aria-hidden />Pay bill</span><ArrowUpRight className="size-4" aria-hidden /></Link></Button>
                    <Button asChild size="lg" variant="outline"><Link to={`/my/bills/${nextBill.id}`}>Details<ChevronRight className="size-3.5" aria-hidden /></Link></Button>
                  </div>
                </div>
                <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                  <p className="mb-3 text-[11px] font-medium text-muted-foreground">Remaining charges · {formatPeriod(nextBill.period)}</p>
                  <BillBreakdown bill={nextBill} currency={currency} />
                </div>
              </>
            ) : (
              <div className="home-clear-balance flex flex-col items-start p-5 sm:p-6">
                <span className="home-neutral-chip mb-5 grid size-11 shrink-0 place-items-center rounded-full">
                  {latest ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <ReceiptText className="size-5 text-muted-foreground" aria-hidden />}
                </span>
                <div className="min-w-0">
                  <p className="mb-2 text-xs text-muted-foreground">{latest ? 'Your balance' : 'Your billing overview'}</p>
                  <p className="home-balance-amount font-display mb-4 font-semibold tabular break-words">{formatMoney(0, currency)}</p>
                  <h2 id="balance-heading" className="text-base font-semibold">{latest ? "You're all caught up" : 'Make yourself at home'}</h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {latest ? nextPaymentDue ? `Your next payment is due ${formatDate(nextPaymentDue)}.` : 'Your next bill will appear here when it is issued.' : 'Your bills will appear here once your landlord issues them.'}
                  </p>
                  <Button asChild size="lg" className="home-primary mt-5 w-full justify-between"><Link to="/my/bills">View your bills <ArrowUpRight className="size-4" aria-hidden /></Link></Button>
                </div>
              </div>
            )}
          </section>

          <section className="home-activity surface overflow-hidden p-5 sm:p-6" aria-labelledby="activity-heading">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><p className="mb-1 text-[10px] font-semibold tracking-[.14em] text-muted-foreground">YOUR MONEY, AT A GLANCE</p><h2 id="activity-heading" className="text-lg font-semibold">Recent activity</h2></div>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted" aria-hidden><ReceiptText className="size-4.5" strokeWidth={1.7} /></span>
            </div>
            <Tabs defaultValue="bills" className="gap-4">
              <TabsList className="home-segments w-full rounded-full bg-muted p-1" aria-label="Recent activity">
                <TabsTrigger value="bills">Bills</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger>
              </TabsList>
              <TabsContent value="bills" className="home-tab-content">
                {bills.isPending ? <Skeleton className="h-56" /> : history.length === 0 ? (
                  <EmptyState variant="inline" icon={ReceiptText} title="No recent activity" description="Your monthly bill history will appear here."
                    illustration={<TenantIllustration src={noActivityIllustration} width={162} height={144} decorative size="compact" className="mb-4" />} />
                ) : (
                  <>
                    <div className="home-history-chart rounded-2xl bg-muted/45 px-2 pt-3">
                      <ColumnChart ariaLabel="Total billed per month" series={[{ name: 'Total billed', color: 'var(--home-chart)' }]} data={history} height={144}
                        formatValue={(v) => formatMoney(v, currency)} formatTick={formatCompact} />
                    </div>
                    <ul className="mt-3 space-y-1">
                      {(bills.data ?? []).slice(0, 4).map((b) => (
                        <li key={b.id}>
                          <Link to={`/my/bills/${b.id}`} className="home-activity-row group -mx-2 flex min-h-16 items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring">
                            <span className="home-month-chip grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-xs font-semibold" aria-hidden>{format(parseISO(b.period), 'MMM')}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">{formatPeriod(b.period)}</span>
                              <span className="mt-1 block text-xs text-muted-foreground">Due {formatDate(b.due_date, 'MMM d')}</span>
                            </span>
                            <span className="flex min-w-0 max-w-[48%] flex-col items-end gap-1.5">
                              <span className="text-right text-sm font-semibold tabular break-words">{formatMoney(b.total_amount, currency)}</span>
                              <BillStatusBadge status={b.status} overdue={b.is_overdue} className="home-status" />
                            </span>
                            <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground @sm:block" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <Link to="/my/bills" className="home-view-all mt-3 flex min-h-11 items-center justify-between rounded-full bg-muted px-4 text-xs font-semibold">View all bills<ArrowRight className="size-3.5" aria-hidden /></Link>
              </TabsContent>
              <TabsContent value="payments" className="home-tab-content">
                {payments.isPending ? <Skeleton className="h-32" /> : payments.error ? (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <p className="text-[13px] text-muted-foreground">Could not load your payments.</p>
                    <Button variant="outline" size="sm" onClick={() => void payments.refetch()}>Try again</Button>
                  </div>
                ) : !payments.data?.length ? (
                  <EmptyState variant="inline" icon={Wallet} title="No payments yet" description="Payments and receipts will appear here after you pay a bill."
                    illustration={<TenantIllustration src={noPaymentsIllustration} width={148} height={145} decorative size="compact" className="mb-4" />} />
                ) : (
                  <ul className="divide-y">
                    {payments.data.slice(0, 3).map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="home-neutral-chip grid size-10 shrink-0 place-items-center rounded-full" aria-hidden>
                          <ArrowDownLeft className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <Link to={`/my/bills/${p.bill_id}`} className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                            {formatPeriod(p.period)}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{METHOD_LABEL[p.method]} · {formatDate(p.paid_on, 'MMM d')}</span>
                        </span>
                        <span className="flex min-w-0 max-w-[50%] flex-col items-end gap-1">
                          <span className="text-right text-sm font-semibold tabular break-words">{formatMoney(p.amount, currency)}</span>
                          {p.status === 'verified' ? (
                            <Link to={`/receipts/${p.id}`} className="inline-flex min-h-11 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                              <ReceiptText className="size-3.5" aria-hidden /> Receipt
                            </Link>
                          ) : <PaymentStatusBadge status={p.status} className="home-status max-w-full text-right whitespace-normal" />}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/my/payments" className="home-view-all mt-3 flex min-h-11 items-center justify-between rounded-full bg-muted px-4 text-xs font-semibold">View all payments<ArrowRight className="size-3.5" aria-hidden /></Link>
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <div className="grid min-w-0 gap-5 @2xl:grid-cols-2 @4xl:grid-cols-1">
          <Panel title="Your space" className="home-tenancy" action={<>
            {room && <TenantIllustration src={residenceIllustration} width={358} height={281} decorative size="thumbnail" />}
            <PanelLink to="/my/room"><ArrowUpRight className="size-4" aria-hidden /><span className="sr-only">Room details</span></PanelLink>
          </>}>
            {tenancy.isPending ? <Skeleton className="h-48" /> : room ? (
              <>
                <div className="home-room-summary flex items-center gap-4 rounded-[1.25rem] p-4">
                  <span className="home-room-icon grid size-14 shrink-0 place-items-center rounded-2xl" aria-hidden><DoorOpen className="size-7" strokeWidth={1.3} /></span>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold tracking-[.1em] text-muted-foreground">HOME SWEET HOME</p>
                    <p className="text-xl font-semibold tracking-tight break-words">Room {room.rooms?.room_number}</p>
                    <p className="mt-1 text-[13px] break-words text-muted-foreground">{settings.data?.property_name ?? 'Your rental'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{room.rooms?.floor != null ? `Floor ${room.rooms.floor} · ` : ''}Since {formatDate(room.start_date)}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="home-live-dot" aria-hidden />Active tenancy</p>
                <dl className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-xs">
                  <div className="min-w-0 space-y-1.5">
                    <dt className="text-muted-foreground">Monthly rent</dt>
                    <dd className="font-semibold tabular break-words">{formatMoney(room.monthly_rent, currency)}</dd>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <dt className="flex items-center gap-1 text-muted-foreground"><ShieldCheck className="size-3" aria-hidden />Deposit held</dt>
                    <dd className="font-semibold tabular break-words">
                      {deposit.isPending ? <Skeleton className="h-4 w-20" /> : deposit.error ? (
                        <button type="button" onClick={() => void deposit.refetch()} className="inline-flex min-h-11 items-center text-xs font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
                          Unavailable · Retry
                        </button>
                      ) : formatMoney(deposit.data, currency)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="border-t pt-4">
                <p className="text-sm font-medium">No active tenancy</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">Your room and billing calendar will appear when your landlord assigns you a room.</p>
              </div>
            )}
          </Panel>

          {room && (
            <Panel title="Billing calendar" className="home-calendar" action={<TenantIllustration src={calendarIllustration} width={1536} height={1024} decorative size="compact" />}>
              <BillingCalendar leaseStartDate={room.start_date} extra={calendarMarks} dueLabel="Payment due" />
              {nextPaymentDue && (
                <div className="home-next-due mt-4 flex items-start gap-3 rounded-2xl bg-muted p-3.5">
                  <span className="home-neutral-chip grid size-9 shrink-0 place-items-center rounded-full" aria-hidden><CalendarDays className="size-4" /></span>
                  <div><p className="text-[11px] text-muted-foreground">Next payment</p><p className="mt-1 text-[13px] font-semibold">{formatDate(nextPaymentDue)}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Due dates follow your move-in day.</p></div>
                </div>
              )}
            </Panel>
          )}

          <Panel title="Here to help" description="Payment instructions & landlord support" className="home-support" action={<Headphones className="size-4 text-muted-foreground" strokeWidth={1.7} aria-hidden />}>
            {settings.isPending ? <Skeleton className="h-24" /> : settings.error ? (
              <div role="alert">
                <p className="text-[13px] text-muted-foreground">Could not load payment instructions.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void settings.refetch()}>Try again</Button>
              </div>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed whitespace-pre-line break-words text-muted-foreground">{settings.data?.payment_instructions || 'Your landlord has not added payment instructions yet.'}</p>
                {(settings.data?.contact_phone || settings.data?.contact_email) && (
                  <div className="mt-4 grid gap-2 border-t pt-4">
                    {settings.data.contact_phone && (
                      <Button variant="outline" asChild className="h-auto min-h-11 justify-start py-2.5 whitespace-normal">
                        <a href={`tel:${settings.data.contact_phone}`}>
                          <Phone aria-hidden /><span className="min-w-0 break-all">{settings.data.contact_phone}</span>
                        </a>
                      </Button>
                    )}
                    {settings.data.contact_email && (
                      <Button variant="outline" asChild className="min-h-11 justify-start">
                        <a href={`mailto:${settings.data.contact_email}`}><Mail aria-hidden /> Email landlord</a>
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
      <p className="flex items-center justify-center gap-1.5 py-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-3" aria-hidden />Your home. All in one place.</p>
    </div>
  )
}
