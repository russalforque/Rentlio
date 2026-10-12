import { Eye, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/app/page-header'
import { Panel } from '@/components/app/panel'
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payment history"
        description={
          data?.length ? (
            <>
              Total verified: <span className="font-semibold text-foreground tabular">{formatMoney(verified, currency)}</span>
            </>
          ) : (
            'Every payment you have made or submitted.'
          )
        }
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
        <Panel title="All payments" description={`${data.length} ${data.length === 1 ? 'payment' : 'payments'}`} flush>
        <ul className="divide-y border-t">
          {data.map((p) => (
            <li key={p.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold tabular">{formatMoney(p.amount, currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    <Link to={`/my/bills/${p.bill_id}`} className="hover:text-foreground hover:underline">
                      {formatPeriod(p.period)} bill
                    </Link>{' '}
                    · {METHOD_LABEL[p.method]} · {formatDate(p.paid_on)}
                    {p.reference_number && ` · Ref ${p.reference_number}`}
                  </p>
                </div>
                <PaymentStatusBadge status={p.status} />
              </div>
              {p.rejection_reason && (
                <p className="mt-2 rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  Not accepted: {p.rejection_reason}
                </p>
              )}
              {p.proof_path && (
                <Button variant="ghost" size="sm" className="mt-1 -ml-2" onClick={() => setViewing(p)}>
                  <Eye /> View proof
                </Button>
              )}
            </li>
          ))}
        </ul>
        </Panel>
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
