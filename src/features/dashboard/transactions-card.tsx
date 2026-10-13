import { AlertCircle, CheckCircle2, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { InitialsBadge, Panel, PanelLink, Segmented, StatusPill } from '@/components/app/panel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { METHOD_LABEL, usePendingPayments } from '@/features/payments/api'
import { useRecentVerifiedPayments } from '@/features/reports/api'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney, initials } from '@/lib/format'

const ROWS = 6

interface Txn {
  id: string
  tenant: string
  room: string
  method: string
  date: string
  amount: number
  pending: boolean
}

export function TransactionsCard({ currency, className }: { currency: string; className?: string }) {
  const recent = useRecentVerifiedPayments(ROWS)
  const pending = usePendingPayments()
  const pendingCount = pending.data?.length ?? 0
  const [tab, setTab] = useState<'recent' | 'review'>('recent')
  const source = tab === 'recent' ? recent : pending
  const rows: Txn[] = (source.data ?? []).slice(0, ROWS).map((p) => ({
    id: p.id,
    tenant: p.tenant_name,
    room: p.room_number,
    method: METHOD_LABEL[p.method],
    date: p.paid_on,
    amount: p.amount,
    pending: tab === 'review',
  }))

  const status = (t: Txn) => (t.pending ? <StatusPill tone="info">Awaiting review</StatusPill> : <StatusPill tone="success">Verified</StatusPill>)

  return (
    <Panel
      title="Transactions"
      flush
      className={className}
      action={
        <>
          <Segmented
            label="Transactions view"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'review', label: pendingCount ? `To review · ${pendingCount}` : 'To review' },
            ]}
          />
          <PanelLink to={tab === 'recent' ? '/payments?tab=history' : '/payments'}>View all</PanelLink>
        </>
      }
    >
      {source.isPending ? (
        <Skeleton className="mx-5 mb-5 h-48" />
      ) : source.error ? (
        <div role="alert" className="flex flex-col items-center gap-3 border-t px-5 py-10 text-center text-[13px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <AlertCircle className="size-4 text-destructive" aria-hidden />
            Could not load payments. {getErrorMessage(source.error)}
          </span>
          <Button variant="outline" size="sm" onClick={() => source.refetch()}>
            <RotateCw /> Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="flex items-center justify-center gap-2 border-t px-5 py-12 text-[13px] text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          {tab === 'recent' ? 'No verified payments yet.' : 'No payments waiting for review.'}
        </p>
      ) : (
        <>
          {/* Phones: one row per payment */}
          <ul className="divide-y border-t sm:hidden">
            {rows.map((t) => (
              <li key={t.id}>
                <Link to={t.pending ? '/payments' : '/payments?tab=history'} className="flex min-h-16 items-center gap-3 px-5 py-3 active:bg-muted">
                  <InitialsBadge text={initials(t.tenant)} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.tenant}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Room {t.room} · {t.method} · {formatDate(t.date, 'MMM d')}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular">{formatMoney(t.amount, currency)}</span>
                    {t.pending && <StatusPill tone="info">Review</StatusPill>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Table className="hidden sm:table">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Tenant</TableHead>
                <TableHead className="hidden lg:table-cell">Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-5">
                    <span className="flex items-center gap-3">
                      <InitialsBadge text={initials(t.tenant)} />
                      <span className="min-w-0">
                        <span className="block max-w-48 truncate font-semibold">{t.tenant}</span>
                        <span className="block text-xs text-muted-foreground">Room {t.room}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{t.method}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(t.date, 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                    {t.pending ? (
                      <Link to="/payments" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        {status(t)}
                      </Link>
                    ) : (
                      status(t)
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right font-semibold tabular">{formatMoney(t.amount, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Panel>
  )
}
