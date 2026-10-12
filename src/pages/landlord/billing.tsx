import { AlertTriangle, ChevronRight, Clock, Gauge, Inbox, Loader2, ReceiptText, Sparkles, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/app/confirm-dialog'
import { PageHeader } from '@/components/app/page-header'
import { FilterChips, Panel, StatGrid, StatTile } from '@/components/app/panel'
import { PeriodPicker } from '@/components/app/period-picker'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBillingRuns, useBills, useGenerateBills, type BillOverview } from '@/features/billing/api'
import { BillStatusBadge } from '@/features/billing/bill-status-badge'
import { usePeriodParam } from '@/hooks/use-period-param'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'open' | 'overdue' | 'paid' | 'void'

const matches = (b: BillOverview, f: Filter) =>
  f === 'all'
    ? b.status !== 'void'
    : f === 'open'
      ? b.status === 'unpaid' || b.status === 'partial'
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
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [confirming, setConfirming] = useState(false)

  const stats = useMemo(() => {
    const live = (bills ?? []).filter((b) => b.status !== 'void')
    const sum = (f: (b: BillOverview) => number) => live.reduce((t, b) => t + f(b), 0)
    return {
      count: live.length,
      billed: sum((b) => b.total_amount),
      collected: sum((b) => b.amount_paid),
      outstanding: sum((b) => b.balance),
      paid: live.filter((b) => b.status === 'paid').length,
      open: live.filter((b) => b.status === 'unpaid' || b.status === 'partial').length,
      overdue: live.filter((b) => b.is_overdue).length,
      pending: sum((b) => b.pending_payments),
      voided: (bills ?? []).length - live.length,
    }
  }, [bills])

  const visible = (bills ?? []).filter((b) => matches(b, filter))
  const lastAuto = runs?.find((r) => r.triggered_by === 'schedule')

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
        title="Billing overview"
        description={
          settings?.auto_billing_enabled
            ? `Bills are created automatically on day ${settings.billing_day} of each month.`
            : 'Automatic billing is off. Generate bills manually each month.'
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/billing/readings?period=${period}`}>
                <Gauge /> Meter readings
              </Link>
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Generate bills
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodPicker value={period} onChange={setPeriod} />
        {lastAuto && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            Last automatic run: {formatDate(lastAuto.ran_at.slice(0, 10))} ({lastAuto.bills_created} bills)
          </p>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="space-y-4">
          <StatGrid>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </StatGrid>
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
              sub={<span className="text-xs text-muted-foreground">{stats.count} bills</span>}
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
            />
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

          {(bills ?? []).length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={`No bills for ${formatPeriod(period)}`}
              description="Generate bills to charge rent to every occupied room. Utilities are added from meter readings, before or after generating."
              action={
                <Button onClick={() => setConfirming(true)}>
                  <Sparkles /> Generate bills
                </Button>
              }
            />
          ) : (
            <Panel
              title={`Bills · ${formatPeriod(period)}`}
              flush
              action={
                <FilterChips
                  label="Filter bills"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: stats.count },
                    { value: 'open', label: 'Unpaid', count: stats.open },
                    { value: 'overdue', label: 'Overdue', count: stats.overdue },
                    { value: 'paid', label: 'Paid', count: stats.paid },
                    ...(stats.voided > 0 ? [{ value: 'void' as const, label: 'Void', count: stats.voided }] : []),
                  ]}
                />
              }
            >
              {visible.length === 0 ? (
                <p className="border-t px-5 py-10 text-center text-[13px] text-muted-foreground">No bills match this filter.</p>
              ) : (
                <>
                  <ul className="divide-y border-t md:hidden">
                    {visible.map((b) => (
                      <li key={b.id}>
                        <Link to={`/billing/bills/${b.id}`} className="flex items-center gap-3 px-5 py-3 active:bg-muted/60">
                          <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/60 text-[13px] font-semibold">
                            {b.room_number}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold">{b.tenant_name}</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <BillStatusBadge status={b.status} overdue={b.is_overdue} />
                              {b.pending_payments > 0 && <span className="text-[11px] font-semibold text-info">Proof to review</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] font-semibold tabular">{formatMoney(b.balance > 0 ? b.balance : b.total_amount, currency)}</p>
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
                                <BillStatusBadge status={b.status} overdue={b.is_overdue} />
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
          )}
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Generate bills for ${formatPeriod(period)}?`}
        description="Every room occupied during this month gets one bill with rent, plus utilities if readings are saved. Rooms that already have a bill are skipped, so this is safe to run again."
        confirmLabel="Generate bills"
        pending={generate.isPending}
        onConfirm={onGenerate}
      />
    </div>
  )
}
