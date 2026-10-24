import { Droplets, Home, type LucideIcon, Plus, Zap } from 'lucide-react'
import { Link } from 'react-router'
import { Meter, Panel, PanelLink } from '@/components/app/panel'
import type { BillOverview } from '@/features/billing/api'
import { formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'
import { pct } from './metrics'

interface Category {
  key: string
  label: string
  icon: LucideIcon
  billed: number
  collected: number
}

/** Rooms listed by number, shortened after a few. */
function roomList(rooms: string[]) {
  const sorted = [...rooms].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return sorted.length > 4 ? `${sorted.slice(0, 4).join(', ')} +${sorted.length - 4}` : sorted.join(', ')
}

/**
 * The month's consolidated bills split by what was charged and what was
 * collected. Per-category figures come from payment allocations, so they always
 * add up to the total collected.
 */
export function CollectionsCard({
  period,
  bills,
  currency,
  className,
}: {
  period: string
  bills: BillOverview[]
  currency: string
  className?: string
}) {
  const sent = bills.filter((b) => b.status !== 'void' && b.is_finalized)
  const sum = (f: (b: BillOverview) => number) => sent.reduce((t, b) => t + f(b), 0)
  const billed = sum((b) => b.total_amount)
  const collected = sum((b) => b.amount_paid)
  const outstanding = sum((b) => b.balance)
  const unpaid = sent.filter((b) => b.status === 'unpaid')
  const partial = sent.filter((b) => b.status === 'partial')

  const categories: Category[] = [
    { key: 'rent', label: 'Rent', icon: Home, billed: sum((b) => b.rent_amount), collected: sum((b) => b.rent_paid) },
    { key: 'electricity', label: 'Electricity', icon: Zap, billed: sum((b) => b.electricity_amount), collected: sum((b) => b.electricity_paid) },
    { key: 'water', label: 'Water', icon: Droplets, billed: sum((b) => b.water_amount), collected: sum((b) => b.water_paid) },
    { key: 'other', label: 'Other charges', icon: Plus, billed: sum((b) => b.other_amount), collected: sum((b) => b.other_paid) },
  ].filter((c) => c.key !== 'other' || c.billed > 0)

  const roomStats = [
    { label: 'Outstanding', value: formatMoney(outstanding, currency), note: `${unpaid.length + partial.length} open bills`, alert: outstanding > 0 },
    { label: 'Unpaid rooms', value: String(unpaid.length), note: unpaid.length ? `Room ${roomList(unpaid.map((b) => b.room_number))}` : 'None' },
    { label: 'Partially paid', value: String(partial.length), note: partial.length ? `Room ${roomList(partial.map((b) => b.room_number))}` : 'None' },
  ]

  return (
    <Panel
      title="Monthly collections"
      description={`Payments against ${formatPeriod(period)} bills`}
      className={className}
      action={<PanelLink to={`/billing?period=${period}`}>Bills</PanelLink>}
    >
      {sent.length === 0 ? (
        <div className="rounded-xl border border-dashed px-5 py-8 text-center">
          <Home className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold">A fresh month of collections</p>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">Finalize your {formatPeriod(period)} bills to see collection progress here.</p>
          <Link to={`/billing?period=${period}`} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none">Go to billing</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="dashboard-collection-summary min-w-0">
            <p className="text-[13px] font-medium text-muted-foreground">Total collected</p>
            <p className="dashboard-collection-value tabular">{formatMoney(collected, currency)}</p>
            <p className="mt-2 text-[13px] text-muted-foreground tabular">
              {pct(collected, billed)}% of {formatMoney(billed, currency)} billed
            </p>
            <div className="mt-3">
              <Meter value={billed > 0 ? (collected / billed) * 100 : 0} label="Share of this month's bills collected" />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              {roomStats.map((s) => (
                <div key={s.label} className={cn('min-w-0 border-t pt-3', s.label === 'Outstanding' && 'col-span-2')}>
                  <dt className="text-[11px] font-medium text-muted-foreground">{s.label}</dt>
                  <dd className={cn('mt-0.5 break-words text-sm font-semibold tabular', s.alert && 'text-destructive')}>{s.value}</dd>
                  <dd className="mt-0.5 text-[11px] text-muted-foreground" title={s.note}>
                    {s.note}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <ul className="grid content-start divide-y" aria-label="Collected by charge type">
            {categories.map((c) => (
              <li key={c.key} className="py-3 first:pt-1 last:pb-0">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
                    <c.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{c.label}</span>
                    <span className="block text-xs wrap-anywhere text-muted-foreground tabular">
                      {formatMoney(c.collected, currency)} of {formatMoney(c.billed, currency)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular">{pct(c.collected, c.billed)}%</span>
                </div>
                <div className="mt-2.5">
                  <Meter value={c.billed > 0 ? (c.collected / c.billed) * 100 : 0} label={`${c.label} collected`} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
