import { CheckCircle2, Eye, FileText, Hourglass, Wallet, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/app/page-header'
import { Panel, StatGrid, StatTile } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { METHOD_LABEL, useMyPayments, type PaymentOverview } from '@/features/payments/api'
import { PaymentStatusBadge, ProofPreview } from '@/features/payments/components'
import { useCurrency } from '@/hooks/use-settings'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'

export function TenantPaymentsPage() {
  const { data, isPending, error, refetch } = useMyPayments()
  const currency = useCurrency()
  const [viewing, setViewing] = useState<PaymentOverview | null>(null)
  const verified = (data ?? []).filter((p) => p.status === 'verified').reduce((t, p) => t + p.amount, 0)
  const pending = (data ?? []).filter((p) => p.status === 'pending')
  const rejected = (data ?? []).filter((p) => p.status === 'rejected').length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payment history"
        description="Every payment you have made or submitted."
      />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payments yet"
          description="Pay a bill from the Bills page and upload your proof of payment."
          action={<Button asChild><Link to="/my/bills">Go to bills</Link></Button>}
        />
      ) : (
        <>
        <StatGrid className="lg:grid-cols-3">
          <StatTile label="Verified" value={formatMoney(verified, currency)} icon={CheckCircle2} sub={<span className="text-xs text-muted-foreground">Counted toward your bills</span>} />
          <StatTile
            label="Awaiting check"
            value={formatMoney(pending.reduce((t, p) => t + p.amount, 0), currency)}
            icon={Hourglass}
            sub={<span className="text-xs text-muted-foreground">{pending.length} {pending.length === 1 ? 'payment' : 'payments'}</span>}
          />
          <div className="col-span-2 grid lg:col-span-1">
            <StatTile
              label="Not accepted"
              value={String(rejected)}
              icon={XCircle}
              sub={<span className={rejected ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>{rejected ? 'Please resubmit' : 'None'}</span>}
            />
          </div>
        </StatGrid>
        <Panel title="All payments" description={`${data.length} ${data.length === 1 ? 'payment' : 'payments'}`} flush>
        <ul className="divide-y border-t">
          {data.map((p) => (
            <li key={p.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tabular md:text-[13px]">{formatMoney(p.amount, currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    <Link to={`/my/bills/${p.bill_id}`} className="hover:text-foreground hover:underline">
                      {formatPeriod(p.period)} bill
                    </Link>{' '}
                    · {METHOD_LABEL[p.method]} · {formatDate(p.paid_on)}
                    {p.provider ? ' · paid online' : p.reference_number && ` · Ref ${p.reference_number}`}
                  </p>
                </div>
                <PaymentStatusBadge status={p.status} />
              </div>
              {p.rejection_reason && (
                <p className="mt-2 rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  Not accepted: {p.rejection_reason}
                </p>
              )}
              {(p.status === 'verified' || p.proof_path) && (
                <div className="mt-1 -ml-3 flex flex-wrap gap-1">
                  {p.status === 'verified' && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/receipts/${p.id}`}>
                        <FileText /> Receipt
                      </Link>
                    </Button>
                  )}
                  {p.proof_path && (
                    <Button variant="ghost" size="sm" onClick={() => setViewing(p)}>
                      <Eye /> View proof
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        </Panel>
        </>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Proof of payment</DialogTitle>
            <DialogDescription>
              {viewing && `${formatMoney(viewing.amount, currency)} · ${formatDate(viewing.paid_on)}`}
            </DialogDescription>
          </DialogHeader>
          {viewing && <ProofPreview path={viewing.proof_path} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
