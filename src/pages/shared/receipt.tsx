import { ArrowLeft, Check, Download, Droplets, Home, type LucideIcon, Plus, ReceiptText, Zap } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BrandMark } from '@/components/app/brand'
import { EmptyState, ErrorState } from '@/components/app/states'
import { TenantIllustration } from '@/components/app/tenant-illustration'
import noReceiptsIllustration from '@/assets/empty_no_receipts.png'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { METHOD_LABEL, usePaymentReceipt } from '@/features/payments/api'
import { useProfile } from '@/hooks/use-auth'
import type { PaymentReceipt } from '@/lib/database.overrides'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

const KIND: Record<PaymentReceipt['lines'][number]['kind'], { label: string; icon: LucideIcon }> = {
  rent: { label: 'Rent', icon: Home },
  electricity: { label: 'Electricity', icon: Zap },
  water: { label: 'Water', icon: Droplets },
  other: { label: 'Other charge', icon: Plus },
}

/** Receipt numbers carry a prefix so they are not mistaken for bill numbers. */
const receiptNo = (n: number) => `R-${n}`

/** A dashed tear line with notches cut into both edges of the slip. */
function TearLine() {
  return (
    <div className="relative my-1 h-5" aria-hidden>
      <span className="absolute top-1/2 -left-2.5 size-5 -translate-y-1/2 rounded-full border bg-background print:hidden" />
      <span className="absolute top-1/2 -right-2.5 size-5 -translate-y-1/2 rounded-full border bg-background print:hidden" />
      <span className="absolute inset-x-5 top-1/2 border-t border-dashed" />
    </div>
  )
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 text-right text-[13px] wrap-break-word', strong ? 'font-semibold' : 'font-medium')}>{children}</dd>
    </div>
  )
}

function Slip({ r }: { r: PaymentReceipt }) {
  const money = (n: number) => formatMoney(n, r.property.currency_code)
  const paidInFull = r.balance_after <= 0
  const applied = r.lines.filter((l) => l.applied > 0)
  const untouched = r.lines.filter((l) => l.applied === 0)
  const verifiedBy = r.payment.provider
    ? 'Confirmed by the payment provider'
    : r.payment.recorded_by_landlord
      ? 'Received by the landlord'
      : 'Verified by the landlord'

  return (
    <article
      aria-label={`Receipt ${receiptNo(r.receipt_number)}`}
      className="surface overflow-hidden print:rounded-none print:border-0 print:shadow-none"
    >
      {/* Who issued it */}
      <header className="flex items-center gap-3 border-b px-6 py-4">
        <BrandMark className="size-8 print:bg-black print:text-white" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{r.property.name}</p>
          {r.property.address && <p className="truncate text-xs text-muted-foreground">{r.property.address}</p>}
        </div>
        <p className="shrink-0 text-right text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Receipt</p>
      </header>

      {/* The headline: what was received */}
      <section className="px-6 pt-7 pb-5 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-success/12 text-success" aria-hidden>
          <Check className="size-5" strokeWidth={2.5} />
        </span>
        <p className="mt-3 text-[13px] font-medium text-muted-foreground">Payment received</p>
        <p className="font-display mt-1 text-[40px] leading-none font-semibold tracking-tight tabular">{money(r.payment.amount)}</p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {formatDate(r.payment.paid_on, 'MMMM d, yyyy')} · {METHOD_LABEL[r.payment.method]}
          {r.payment.provider && ' (online)'}
        </p>
        <span
          className={cn(
            'mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
            paidInFull ? 'bg-success/10 text-success ring-success/20' : 'bg-info/8 text-info ring-info/20',
          )}
        >
          {paidInFull ? `${formatPeriod(r.bill.period)} bill paid in full` : `Partial payment · ${money(r.balance_after)} left`}
        </span>
      </section>

      <TearLine />

      {/* Reference details */}
      <dl className="px-6 py-3">
        <Row label="Receipt no.">
          <span className="tabular">{receiptNo(r.receipt_number)}</span>
        </Row>
        <Row label="Received from">{r.tenant_name}</Row>
        <Row label="Room">{r.room_number}</Row>
        <Row label="Bill">
          #{r.bill.bill_number} · {formatPeriod(r.bill.period)}
        </Row>
        {r.payment.reference_number && (
          <Row label="Reference">
            <span className="break-all tabular">{r.payment.reference_number}</span>
          </Row>
        )}
      </dl>

      <TearLine />

      {/* Where the money went */}
      <section aria-label="How this payment was applied" className="px-6 py-3">
        <h2 className="pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Applied to</h2>
        <ul>
          {applied.map((l, i) => {
            const { icon: Icon, label } = KIND[l.kind]
            return (
              <li key={i} className="flex items-start gap-3 py-2">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground" aria-hidden>
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground" title={l.description}>
                    {l.remaining <= 0 ? 'Paid in full' : `${money(l.remaining)} of ${money(l.amount)} left`}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] font-semibold tabular">{money(l.applied)}</p>
              </li>
            )
          })}
        </ul>
        {untouched.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Not covered by this payment:{' '}
            {untouched
              .map((l) => `${KIND[l.kind].label.toLowerCase()} ${l.remaining > 0 ? `(${money(l.remaining)} left)` : '(already paid)'}`)
              .join(', ')}
            .
          </p>
        )}
      </section>

      <TearLine />

      {/* The bill's balance before and after */}
      <dl className="px-6 py-3">
        <Row label="Bill total">
          <span className="tabular">{money(r.bill.total_amount)}</span>
        </Row>
        <Row label="Paid before">
          <span className="tabular">{money(r.bill.total_amount - r.balance_before)}</span>
        </Row>
        <Row label="This payment">
          <span className="tabular">− {money(r.payment.amount)}</span>
        </Row>
        <div className="mt-2 flex items-baseline justify-between gap-4 rounded-lg bg-muted/70 px-3 py-2.5">
          <dt className="text-sm font-semibold">{paidInFull ? 'Balance' : 'Balance remaining'}</dt>
          <dd className={cn('text-base font-semibold tabular', !paidInFull && 'text-foreground')}>{money(r.balance_after)}</dd>
        </div>
      </dl>

      <footer className="mt-2 border-t bg-muted/40 px-6 py-4 text-center text-xs leading-relaxed text-muted-foreground print:bg-transparent">
        <p className="font-medium text-foreground">Thank you for your payment.</p>
        <p className="mt-1">
          {verifiedBy} on {formatDate(r.payment.verified_at.slice(0, 10))}. Security deposits are held separately and are not part
          of this receipt.
        </p>
        {(r.property.contact_phone || r.property.contact_email) && (
          <p className="mt-1">Questions? {[r.property.contact_phone, r.property.contact_email].filter(Boolean).join(' · ')}</p>
        )}
      </footer>
    </article>
  )
}

/**
 * One receipt per verified payment. "Download PDF" uses the browser's
 * save-as-PDF, so the slip is laid out to print cleanly on one page.
 */
export function ReceiptPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const profile = useProfile()
  const { data: r, isPending, error, refetch } = usePaymentReceipt(id)

  useEffect(() => {
    if (r) document.title = `Receipt ${receiptNo(r.receipt_number)} · Rentlio`
    return () => {
      document.title = 'Rentlio'
    }
  }, [r])

  const back = profile.role === 'landlord' ? '/payments' : '/my/payments'

  return (
    <div className="min-h-dvh bg-background px-4 py-6 sm:py-12 print:bg-white print:p-0">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" className="-ml-3" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(back))}>
            <ArrowLeft /> Back
          </Button>
          {r && (
            <Button variant="outline" onClick={() => window.print()}>
              <Download /> Download PDF
            </Button>
          )}
        </div>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isPending ? (
          <Skeleton className="h-144 rounded-xl" />
        ) : !r ? (
          <EmptyState
            icon={ReceiptText}
            illustration={profile.role === 'tenant'
              ? <TenantIllustration src={noReceiptsIllustration} width={153} height={144} decorative loading="eager" className="mb-4" />
              : undefined}
            title="Receipt not found"
            description="Receipts exist only for verified payments on your own bills."
            action={
              <Button asChild variant="outline">
                <Link to={back}>Back to payments</Link>
              </Button>
            }
          />
        ) : (
          <Slip r={r} />
        )}
      </div>
    </div>
  )
}
