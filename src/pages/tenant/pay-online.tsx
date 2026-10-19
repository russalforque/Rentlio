import { ArrowRight, Building2, CheckCircle2, CreditCard, LockKeyhole, ReceiptText, Smartphone, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { TenantPageHeader } from '@/components/app/tenant-page-header'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyBills } from '@/features/portal/api'
import { SubmitPaymentDialog } from '@/features/payments/payment-dialogs'
import type { BillOverview } from '@/features/billing/api'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

function PayMethod({
  icon: Icon,
  title,
  note,
  badge,
}: {
  icon: typeof Wallet
  title: string
  note: string
  badge?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{title}</p>
          {badge && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{badge}</span>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
      </div>
    </div>
  )
}

function BillChoice({
  bill,
  currency,
  selected,
  onSelect,
}: {
  bill: BillOverview
  currency: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'tenant-bill-choice flex w-full min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 py-4 text-left transition-colors duration-200 hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-foreground/70 ring-1 ring-foreground/70',
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <ReceiptText className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold break-words">{formatPeriod(bill.period)}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">Due {formatDate(bill.due_date)}</span>
      </span>
      <span className="tenant-list-amount">
        <span className="block text-[13px] font-semibold tabular">{formatMoney(bill.balance, currency)}</span>
        <span className="block text-[11px] text-muted-foreground">{bill.is_overdue ? 'Overdue' : 'Balance due'}</span>
      </span>
    </button>
  )
}

export function TenantPayOnlinePage() {
  const bills = useMyBills()
  const settings = useSettings()
  const currency = useCurrency()
  const [params, setParams] = useSearchParams()
  const [paying, setPaying] = useState(false)
  const openBills = (bills.data ?? [])
    .filter((bill) => (bill.status === 'unpaid' || bill.status === 'partial') && bill.balance > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const requestedId = params.get('bill')
  const selected = openBills.find((bill) => bill.id === requestedId) ?? openBills[0]
  const onlineEnabled = !!settings.data?.online_payments_enabled

  const selectBill = (billId: string) => {
    setParams({ bill: billId }, { replace: true })
  }

  if (bills.error) return <ErrorState error={bills.error} onRetry={() => void bills.refetch()} />

  return (
    <div className="tenant-page tenant-pay-page @container mx-auto space-y-5 sm:space-y-6">
      <TenantPageHeader
        title="Pay online"
        description="Choose a bill and the payment method that works best for you."
      />

      {bills.isPending ? (
        <Skeleton className="h-80 rounded-3xl" />
      ) : openBills.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="You're all caught up"
          description="When you have an outstanding bill, you can pay it here."
          action={<Button asChild variant="outline"><Link to="/my/bills">View bills</Link></Button>}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(19rem,.9fr)] lg:items-start">
          <section className="surface space-y-4 p-5 sm:p-7" aria-labelledby="choose-bill-title">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Step 1</p>
              <h2 id="choose-bill-title" className="mt-1 text-lg font-semibold">Select a bill</h2>
              <p className="mt-1 text-sm text-muted-foreground">You can make a partial payment if needed.</p>
            </div>
            <div className="grid gap-2.5">
              {openBills.map((bill) => (
                <BillChoice
                  key={bill.id}
                  bill={bill}
                  currency={currency}
                  selected={selected?.id === bill.id}
                  onSelect={() => selectBill(bill.id)}
                />
              ))}
            </div>

            {selected && (
              <div className="rounded-2xl bg-muted/60 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Total to settle</p>
                    <p className="tenant-summary-amount font-display mt-2 font-semibold tabular">{formatMoney(selected.balance, currency)}</p>
                  </div>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-card">
                    <Building2 className="size-5 text-muted-foreground" aria-hidden />
                  </span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Room {selected.room_number} <span aria-hidden>·</span> {formatPeriod(selected.period)}
                  {selected.pending_amount > 0 && (
                    <> <span aria-hidden>·</span> {formatMoney(selected.pending_amount, currency)} pending verification</>
                  )}
                </p>
              </div>
            )}
          </section>

          <section className="tenant-pay-summary surface space-y-4 p-5 sm:p-7" aria-labelledby="payment-method-title">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Step 2</p>
              <h2 id="payment-method-title" className="mt-1 text-lg font-semibold">Choose how to pay</h2>
              <p className="mt-1 text-sm text-muted-foreground">Your payment is securely tied to the selected bill.</p>
            </div>
            <div className="grid gap-2.5">
              <PayMethod
                icon={Smartphone}
                title="Bank transfer or e-wallet"
                note="Use your landlord's QR code or account number, then upload payment proof."
                badge="QR + proof"
              />
              {onlineEnabled && (
                <PayMethod
                  icon={CreditCard}
                  title="Secure online checkout"
                  note="Pay with an available wallet, card, or QR payment method."
                  badge="PayMongo"
                />
              )}
              <PayMethod
                icon={Wallet}
                title="Pay in person"
                note="Pay your landlord directly and they will record it for you."
              />
            </div>
            <Button
              size="lg"
              className="h-12 w-full rounded-full text-sm"
              onClick={() => setPaying(true)}
              disabled={!selected || (selected.balance - (selected.pending_amount ?? 0) <= 0)}
            >
              Continue to payment <ArrowRight />
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5" aria-hidden /> Your payment details stay private and protected
            </p>
          </section>
        </div>
      )}

      {selected && <SubmitPaymentDialog bill={selected} open={paying} onOpenChange={setPaying} />}
    </div>
  )
}
