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
      title={`Collections · ${formatPeriod(period)}`}
      description="From bills sent to tenants this month"
      className={className}
      action={<PanelLink to={`/billing?period=${period}`}>Bills</PanelLink>}
    >
      {sent.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No bills sent for {formatPeriod(period)} yet.{' '}
          <Link to={`/billing?period=${period}`} className="font-medium text-foreground underline-offset-2 hover:underline">
            Finalize this month's bills
          </Link>{' '}
          to start collecting.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-muted-foreground">Total collected</p>
            <p className="font-display mt-1 text-[32px] leading-none font-semibold tabular">{formatMoney(collected, currency)}</p>
            <p className="mt-2 text-[13px] text-muted-foreground tabular">
              {pct(collected, billed)}% of {formatMoney(billed, currency)} billed
            </p>
            <div className="mt-3">
              <Meter value={billed > 0 ? (collected / billed) * 100 : 0} label="Share of this month's bills collected" />
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-2">
              {roomStats.map((s) => (
                <div key={s.label} className="min-w-0 rounded-xl border px-3 py-2.5">
                  <dt className="truncate text-[11px] font-medium text-muted-foreground">{s.label}</dt>
                  <dd className={cn('mt-0.5 truncate text-sm font-semibold tabular', s.alert && 'text-destructive')}>{s.value}</dd>
                  <dd className="mt-0.5 truncate text-[11px] text-muted-foreground" title={s.note}>
                    {s.note}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <ul className="grid content-start gap-2" aria-label="Collected by charge type">
            {categories.map((c) => (
              <li key={c.key} className="rounded-xl border px-3.5 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
                    <c.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{c.label}</span>
                    <span className="block truncate text-xs text-muted-foreground tabular">
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
