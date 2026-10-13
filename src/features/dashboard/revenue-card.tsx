import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { AreaChart } from '@/components/app/area-chart'
import { Panel, PanelLink, Segmented } from '@/components/app/panel'
import { formatCompact, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'
import { pct, type MonthRow } from './metrics'

export function RevenueCard({ months, currency, className }: { months: MonthRow[]; currency: string; className?: string }) {
  const [range, setRange] = useState<'6' | '12'>('6')
  const rows = months.slice(-Number(range))
  const billed = rows.reduce((t, r) => t + r.billed, 0)
  const collected = rows.reduce((t, r) => t + r.collected, 0)
  const outstanding = rows.reduce((t, r) => t + r.outstanding, 0)

  return (
    <Panel
      title="Revenue"
      description="Billed and collected, by billing month"
      className={className}
      action={
        <>
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: '6', label: '6M' },
              { value: '12', label: '12M' },
            ]}
          />
          <PanelLink to="/reports">Report</PanelLink>
        </>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Collected, last {range} months</p>
          <p className="mt-1 text-[32px] leading-none font-semibold tracking-tight sm:text-[40px]">{formatMoney(collected, currency)}</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-foreground/80" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full bg-chart-1" aria-hidden /> Billed
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-sm border-t-2 border-chart-2 bg-chart-2/15" aria-hidden /> Collected
          </li>
        </ul>
      </div>

      <div className="mt-5">
        <AreaChart
          ariaLabel={`Billed and collected per month, last ${range} months`}
          height={240}
          labels={rows.map((r) => format(parseISO(r.period), 'MMM'))}
          titles={rows.map((r) => formatPeriod(r.period))}
          series={[
            { name: 'Billed', color: 'var(--chart-1)', kind: 'line', values: rows.map((r) => r.billed) },
            { name: 'Collected', color: 'var(--chart-2)', kind: 'area', values: rows.map((r) => r.collected) },
          ]}
          formatValue={(v) => formatMoney(v, currency)}
          formatTick={formatCompact}
        />
      </div>

      <dl className="mt-5 grid grid-cols-1 divide-y rounded-xl border bg-muted/30 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          { label: 'Billed', value: formatMoney(billed, currency) },
          { label: 'Collection rate', value: `${pct(collected, billed)}%` },
          { label: 'Still open', value: formatMoney(outstanding, currency), alert: outstanding > 0 },
        ].map((s) => (
          <div key={s.label} className="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5 sm:block">
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className={cn('truncate text-sm font-semibold tabular sm:mt-0.5', s.alert && 'text-destructive')}>{s.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
