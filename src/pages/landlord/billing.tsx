import { AlertTriangle, ChevronRight, Clock, FilePen, Gauge, Inbox, Loader2, ReceiptText, Send, Sparkles, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/app/confirm-dialog'
import { PageHeader } from '@/components/app/page-header'
import { Callout, FilterChips, Panel, Meter, SearchField, StatGrid, StatGridSkeleton, StatTile, Toolbar } from '@/components/app/panel'
import { PeriodPicker } from '@/components/app/period-picker'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBillingRuns, useBills, useFinalizeBills, useGenerateBills, type BillOverview } from '@/features/billing/api'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { usePeriodParam } from '@/hooks/use-period-param'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { isFuturePeriod } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'draft' | 'open' | 'overdue' | 'paid' | 'void'

const isDraft = (b: BillOverview) => b.status !== 'void' && !b.is_finalized

const matches = (b: BillOverview, f: Filter) =>
  f === 'all'
    ? b.status !== 'void'
    : f === 'draft'
      ? isDraft(b)
      : f === 'open'
        ? b.is_finalized && (b.status === 'unpaid' || b.status === 'partial')
        : f === 'overdue'
          ? b.is_overdue
          : b.status === f

export function BillingPage() {
  const [period, setPeriod] = usePeriodParam()
  const { data: bills, isPending, error, refetch } = useBills(period)
  const { data: runs } = useBillingRuns()
  const { data: settings } = useSettings()
  const currency = useCurrency()
  const generate = useGenerateBills()
  const finalizeAll = useFinalizeBills()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  const stats = useMemo(() => {
    // Money figures cover bills sent to tenants; drafts are not owed yet.
    const live = (bills ?? []).filter((b) => b.status !== 'void' && b.is_finalized)
    const drafts = (bills ?? []).filter(isDraft)
    const sum = (f: (b: BillOverview) => number) => live.reduce((t, b) => t + f(b), 0)
    return {
      all: live.length + drafts.length,
      drafts: drafts.length,
      ready: drafts.filter((b) => b.missing_charges.length === 0 && b.total_amount > 0).length,
      count: live.length,
      billed: sum((b) => b.total_amount),
      collected: sum((b) => b.amount_paid),
      outstanding: sum((b) => b.balance),
      paid: live.filter((b) => b.status === 'paid').length,
      open: live.filter((b) => b.status === 'unpaid' || b.status === 'partial').length,
      overdue: live.filter((b) => b.is_overdue).length,
      pending: sum((b) => b.pending_payments),
      voided: (bills ?? []).filter((b) => b.status === 'void').length,
    }
  }, [bills])

  const visible = (bills ?? []).filter((b) => matches(b, filter)
    && `${b.tenant_name} ${b.room_number} ${b.bill_number}`.toLowerCase().includes(search.trim().toLowerCase()))
  const lastAuto = runs?.find((r) => r.triggered_by === 'schedule')
  // The database refuses months that have not started; say so before the landlord tries.
  const future = isFuturePeriod(period)

  const onFinalizeAll = () =>
    finalizeAll.mutate(period, {
      onSuccess: (sent) => {
        setFinalizing(false)
        toast.success(`${sent} ${sent === 1 ? 'bill' : 'bills'} sent to tenants`)
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    })

  const onGenerate = () =>
    generate.mutate(period, {
      onSuccess: (created) => {
        setConfirming(false)
        if (created === 0) toast.info(`All occupied rooms already have a bill for ${formatPeriod(period)}.`)
        else toast.success(`${created} ${created === 1 ? 'bill' : 'bills'} created for ${formatPeriod(period)}`)
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    })

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="RENT & UTILITIES"
        title="Billing overview"
        description={
          settings?.auto_billing_enabled
            ? 'Bills are created automatically on each rental agreement’s move-in anniversary.'
            : 'Automatic billing is off. Generate anniversary-based bills manually.'
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/billing/readings?period=${period}`}>
                <Gauge /> Readings
              </Link>
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={generate.isPending || future}>
              {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Generate bills
            </Button>
          </>
        }
      />

      <nav aria-label="Monthly billing workflow" className="grid grid-cols-1 divide-y rounded-lg border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          { step: '01', title: 'Enter readings', note: 'Review electricity consumption', to: `/billing/readings?period=${period}` },
          { step: '02', title: 'Review bills', note: 'Check rent and utility charges', to: '#bill-list' },
          { step: '03', title: 'Finalize & send', note: 'Issue complete drafts to tenants', to: '#bill-list' },
        ].map((item) => <Link key={item.step} to={item.to} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><span className="text-xs font-medium text-muted-foreground tabular">{item.step}</span><span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{item.note}</span></span></Link>)}
      </nav>
      <Toolbar className="px-0 py-1">
        <PeriodPicker value={period} onChange={setPeriod} />
        {future && (
          <p className="px-1 pb-1 text-xs text-muted-foreground sm:pb-0">
            {formatPeriod(period)} has not started. Its bills can be generated from its first day.
          </p>
        )}
        {lastAuto && (
          <p className="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground sm:pb-0">
            <Clock className="size-3.5" />
            Last automatic run: {formatDate(lastAuto.ran_at.slice(0, 10))} ({lastAuto.bills_created} bills)
          </p>
        )}
      </Toolbar>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="space-y-4">
          <StatGridSkeleton />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          <StatGrid>
            <StatTile
              label="Billed"
              value={formatMoney(stats.billed, currency)}
              icon={ReceiptText}
              accent="violet"
              sub={
                <span className="text-xs text-muted-foreground">
                  {stats.count} sent{stats.drafts > 0 && ` · ${stats.drafts} draft${stats.drafts === 1 ? '' : 's'}`}
                </span>
              }
            />
            <StatTile
              label="Collected"
              value={formatMoney(stats.collected, currency)}
              icon={Wallet}
              accent="green"
              sub={
                <span className="text-xs text-muted-foreground">
                  {stats.billed > 0 ? `${Math.round((stats.collected / stats.billed) * 100)}% · ` : ''}
                  {stats.paid} fully paid
                </span>
              }
            >
              <Meter value={stats.billed > 0 ? (stats.collected / stats.billed) * 100 : 0} label="Share of this month's bills collected" />
            </StatTile>
            <StatTile
              label="Outstanding"
              value={formatMoney(stats.outstanding, currency)}
              icon={AlertTriangle}
              accent="amber"
              sub={
                <span className={stats.overdue ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                  {stats.overdue ? `${stats.overdue} overdue` : 'None overdue'}
                </span>
              }
            />
            <StatTile
              label="Awaiting verification"
              value={String(stats.pending)}
              icon={Inbox}
              accent="blue"
              to={stats.pending ? '/payments' : undefined}
              sub={<span className="text-xs text-muted-foreground">{stats.pending ? 'Payments to review' : 'All reviewed'}</span>}
            />
          </StatGrid>

          {stats.drafts > 0 && (
            <Callout
              tone="info"
              icon={FilePen}
              action={
                stats.ready > 0 && (
                  <Button size="sm" onClick={() => setFinalizing(true)} disabled={finalizeAll.isPending}>
                    {finalizeAll.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                    Finalize {stats.ready} ready
                  </Button>
                )
              }
            >
              <span className="font-semibold">
                {stats.drafts} draft {stats.drafts === 1 ? 'bill' : 'bills'} not sent yet.
              </span>{' '}
              {stats.ready === stats.drafts
                ? 'Every one has its rent, electricity and water charges.'
                : `${stats.drafts - stats.ready} still ${stats.drafts - stats.ready === 1 ? 'needs' : 'need'} a meter reading.`}{' '}
              <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setFilter('draft')}>
                Show drafts
              </button>
            </Callout>
          )}

          {(bills ?? []).length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={`No bills for ${formatPeriod(period)}`}
              description="Generate this month's draft bills with rent for every occupied room. Add meter readings, then finalize to send one bill per tenant."
              action={
                <Button onClick={() => setConfirming(true)}>
                  <Sparkles /> Generate bills
                </Button>
              }
            />
          ) : (
            <div id="bill-list" className="min-w-0 scroll-mt-24">
            <Panel
              title={`Bills · ${formatPeriod(period)}`}
              flush
              action={
                <SearchField aria-label="Search bills" placeholder="Search room, tenant or bill…" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full sm:w-64" />
              }
            >
              <div className="min-w-0 border-t px-4 py-3">
                <FilterChips
                  label="Filter bills"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: stats.all },
                    ...(stats.drafts > 0 ? [{ value: 'draft' as const, label: 'Drafts', count: stats.drafts }] : []),
                    { value: 'open', label: 'Unpaid', count: stats.open },
                    { value: 'overdue', label: 'Overdue', count: stats.overdue },
                    { value: 'paid', label: 'Paid', count: stats.paid },
                    ...(stats.voided > 0 ? [{ value: 'void' as const, label: 'Void', count: stats.voided }] : []),
                  ]}
                />
              </div>
              {visible.length === 0 ? (
                <p className="border-t px-5 py-10 text-center text-[13px] text-muted-foreground">No bills match this filter.</p>
              ) : (
                <>
                  <ul className="divide-y border-t md:hidden">
                    {visible.map((b) => (
                      <li key={b.id}>
                        <Link to={`/billing/bills/${b.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3 active:bg-muted/60">
                          <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/60 text-[13px] font-semibold">
                            {b.room_number}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{b.tenant_name}</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <BillStatusBadge status={b.status} overdue={b.is_overdue} draft={isDraft(b)} />
                              {b.pending_payments > 0 && <span className="text-[11px] font-semibold text-info">Proof to review</span>}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular">{formatMoney(b.balance > 0 ? b.balance : b.total_amount, currency)}</p>
                            <p className="text-[11px] text-muted-foreground">{b.balance > 0 ? 'due' : 'total'}</p>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="pl-5">Room</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead className="pr-5">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((b) => (
                          <TableRow key={b.id} className="cursor-pointer" onClick={() => navigate(`/billing/bills/${b.id}`)}>
                            <TableCell className="pl-5 font-semibold">
                              <Link to={`/billing/bills/${b.id}`} onClick={(e) => e.stopPropagation()}>
                                {b.room_number}
                              </Link>
                              <span className="block text-[11px] font-normal text-muted-foreground">#{b.bill_number}</span>
                            </TableCell>
                            <TableCell className="max-w-48 truncate font-medium">{b.tenant_name}</TableCell>
                            <TableCell className="text-right tabular">{formatMoney(b.total_amount, currency)}</TableCell>
                            <TableCell className="text-right tabular">{formatMoney(b.amount_paid, currency)}</TableCell>
                            <TableCell className={cn('text-right font-semibold tabular', b.balance > 0 && b.status !== 'void' && 'text-destructive')}>
                              {formatMoney(b.status === 'void' ? 0 : b.balance, currency)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(b.due_date, 'MMM d')}</TableCell>
                            <TableCell className="pr-5">
                              <div className="flex flex-col items-start gap-1">
                                <BillStatusBadge status={b.status} overdue={b.is_overdue} draft={isDraft(b)} />
                                {b.pending_payments > 0 && (
                                  <span className="text-[11px] font-semibold text-info">Proof to review</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </Panel>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Generate bills for ${formatPeriod(period)}?`}
        description="Every room occupied during this month gets one draft bill with rent, plus electricity and water if readings are saved. Tenants see a bill once you finalize it. Rooms that already have a bill are skipped, so this is safe to run again."
        confirmLabel="Generate bills"
        pending={generate.isPending}
        onConfirm={onGenerate}
      />
      <ConfirmDialog
        open={finalizing}
        onOpenChange={setFinalizing}
        title={`Send ${stats.ready} ${stats.ready === 1 ? 'bill' : 'bills'}?`}
        description="Each complete draft is finalized: its charges are locked and the tenant is notified that their bill is ready. Drafts still missing a reading stay as drafts."
        confirmLabel="Finalize and send"
        pending={finalizeAll.isPending}
        onConfirm={onFinalizeAll}
      />
    </div>
  )
}
