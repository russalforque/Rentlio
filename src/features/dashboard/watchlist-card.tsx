import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { CheckCircle2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Panel, Segmented } from '@/components/app/panel'
import type { OpenBill } from '@/features/reports/api'
import { todayISO } from '@/lib/dates'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const LIST_LIMIT = 5
const DUE_SOON_DAYS = 14

function DateBlock({ date, tone }: { date: string; tone?: 'overdue' }) {
  return (
    <span
      className={cn(
        'grid w-11 shrink-0 place-items-center rounded-lg border py-1 text-center leading-none',
        tone === 'overdue' && 'border-destructive/25 bg-destructive/5',
      )}
      aria-hidden
    >
      <span className={cn('text-[10px] font-medium uppercase', tone === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
        {formatDate(date, 'MMM')}
      </span>
      <span className="mt-0.5 text-[15px] font-semibold tabular">{formatDate(date, 'd')}</span>
    </span>
  )
}

interface OverdueTenant {
  id: string
  name: string
  room: string
  amount: number
  oldest: string
  bills: number
}

/** Overdue bills rolled up per tenant, largest balance first. */
function groupOverdue(bills: OpenBill[]): OverdueTenant[] {
  const map = new Map<string, OverdueTenant>()
  for (const b of bills) {
    if (!b.is_overdue) continue
    const cur = map.get(b.tenant_id)
    if (cur) {
      cur.amount += b.balance
      cur.bills++
      if (b.due_date < cur.oldest) cur.oldest = b.due_date
    } else map.set(b.tenant_id, { id: b.tenant_id, name: b.tenant_name, room: b.room_number, amount: b.balance, oldest: b.due_date, bills: 1 })
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

export function WatchlistCard({ bills, currency, className }: { bills: OpenBill[]; currency: string; className?: string }) {
  const today = todayISO()
  const horizon = format(addDays(new Date(), DUE_SOON_DAYS), 'yyyy-MM-dd')
  const dueSoon = bills.filter((b) => !b.is_overdue && b.due_date >= today && b.due_date <= horizon).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const overdue = useMemo(() => groupOverdue(bills), [bills])
  const [tab, setTab] = useState<'soon' | 'overdue'>(overdue.length ? 'overdue' : 'soon')
  const overdueTotal = overdue.reduce((t, o) => t + o.amount, 0)
  const dueSoonTotal = dueSoon.reduce((t, b) => t + b.balance, 0)

  return (
    <Panel
      title="Collections watchlist"
      className={className}
      action={
        <Segmented
          label="Watchlist view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overdue', label: `Overdue · ${overdue.length}` },
            { value: 'soon', label: `Due soon · ${dueSoon.length}` },
          ]}
        />
      }
    >
      <dl className="mb-4 grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Overdue</dt>
          <dd className="mt-0.5 truncate text-[15px] font-semibold text-destructive tabular">{formatMoney(overdueTotal, currency)}</dd>
        </div>
        <div className="min-w-0 rounded-xl border bg-muted/30 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Due in {DUE_SOON_DAYS} days</dt>
          <dd className="mt-0.5 truncate text-[15px] font-semibold tabular">{formatMoney(dueSoonTotal, currency)}</dd>
        </div>
      </dl>
      {tab === 'overdue' ? (
        overdue.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden /> No overdue balances.
          </p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {overdue.slice(0, LIST_LIMIT).map((t) => (
              <li key={t.id}>
                <Link to={`/tenants/${t.id}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                  <DateBlock date={t.oldest} tone="overdue" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Room {t.room} · {differenceInCalendarDays(new Date(), parseISO(t.oldest))} days late
                      {t.bills > 1 ? ` · ${t.bills} bills` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-destructive tabular">{formatMoney(t.amount, currency)}</span>
                </Link>
              </li>
            ))}
            {overdue.length > LIST_LIMIT && (
              <li className="px-2 pt-1">
                <Link to="/tenants" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  +{overdue.length - LIST_LIMIT} more overdue tenants
                </Link>
              </li>
            )}
          </ul>
        )
      ) : dueSoon.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden /> Nothing due in the next two weeks.
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {dueSoon.slice(0, LIST_LIMIT).map((b) => {
            const days = differenceInCalendarDays(parseISO(b.due_date), new Date())
            return (
              <li key={b.id}>
                <Link to={`/billing/bills/${b.id}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                  <DateBlock date={b.due_date} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{b.tenant_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Room {b.room_number} · {days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `in ${days} days`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular">{formatMoney(b.balance, currency)}</span>
                </Link>
              </li>
            )
          })}
          {dueSoon.length > LIST_LIMIT && (
            <li className="px-2 pt-1">
              <Link to="/billing" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                +{dueSoon.length - LIST_LIMIT} more in Billing
              </Link>
            </li>
          )}
        </ul>
      )}
    </Panel>
  )
}
