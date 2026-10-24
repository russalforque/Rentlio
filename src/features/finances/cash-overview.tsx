import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { Panel, PanelLink } from '@/components/app/panel'
import { ErrorState } from '@/components/app/states'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings } from '@/hooks/use-settings'
import { todayISO } from '@/lib/dates'
import { formatDate, formatMoney } from '@/lib/format'
import { useDailyCashReport } from './api'
import { DailyCashReport } from './daily-cash-report'

export function CashOverview({ className }: { className?: string }) {
  const { data: settings } = useSettings()
  const date = todayISO(new Date(), settings?.timezone)
  const report = useDailyCashReport(date, true)
  const currency = settings?.currency_code ?? 'PHP'
  return <Panel title="Today's cash" description={`${formatDate(date, 'MMM d, yyyy')} · Cash payments only`} className={className} action={<PanelLink to="/finances">Finances</PanelLink>}>
    {report.error ? <ErrorState error={report.error} onRetry={() => report.refetch()} /> : !report.data ? <Skeleton className="h-40" /> : <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="size-4" aria-hidden /> Cash on hand</div>
      <p className="my-2 break-all text-3xl font-semibold tracking-tight tabular">{formatMoney(report.data.endingCash, currency)}</p>
      <p className="text-xs text-muted-foreground">Beginning balance {formatMoney(report.data.beginningCash, currency)}</p>
      <dl className="my-5 grid grid-cols-2 gap-4 border-y py-4">
        <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowDownLeft className="size-3.5" /> Income</dt><dd className="mt-1 break-all text-sm font-semibold tabular">+{formatMoney(report.data.income, currency)}</dd></div>
        <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpRight className="size-3.5" /> Expenses</dt><dd className="mt-1 break-all text-sm font-semibold tabular">−{formatMoney(report.data.expenses, currency)}</dd></div>
      </dl>
      <DailyCashReport />
      <Link to="/finances" className="mt-3 inline-flex min-h-10 items-center text-xs font-medium underline-offset-4 hover:underline">Review income and expenses</Link>
    </>}
  </Panel>
}
