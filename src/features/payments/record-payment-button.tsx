import { ChevronRight, Wallet } from 'lucide-react'
import { useState } from 'react'
import { SearchField, StatusPill } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useOpenBills, type OpenBill } from '@/features/reports/api'
import { useCurrency } from '@/hooks/use-settings'
import { formatDate, formatMoney, formatPeriod } from '@/lib/format'
import { RecordPaymentDialog } from './payment-dialogs'

/** One entry point from dashboard, tenant, payments and finances; uses the existing payment RPC. */
export function RecordPaymentButton({ tenantId, variant = 'default', className }: {
  tenantId?: string; variant?: 'default' | 'outline'; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [bill, setBill] = useState<OpenBill | null>(null)
  return <>
    <Button variant={variant} className={className} onClick={() => setOpen(true)}><Wallet /> Record payment</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Choose a bill</DialogTitle><DialogDescription>Find a tenant or room. Record a full or partial payment against an issued bill.</DialogDescription></DialogHeader>
        {open && <BillPicker tenantId={tenantId} onSelect={(selected) => { setOpen(false); setBill(selected) }} />}
      </DialogContent>
    </Dialog>
    {bill && <RecordPaymentDialog bill={bill} open onOpenChange={(next) => { if (!next) setBill(null) }} />}
  </>
}

function BillPicker({ tenantId, onSelect }: { tenantId?: string; onSelect: (bill: OpenBill) => void }) {
  const bills = useOpenBills()
  const currency = useCurrency()
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visible = (bills.data ?? []).filter((bill) => (!tenantId || bill.tenant_id === tenantId)
    && `${bill.tenant_name} ${bill.room_number} ${formatPeriod(bill.period)}`.toLowerCase().includes(query))
  return <div className="grid min-w-0 gap-3">
    <SearchField aria-label="Search unpaid bills" placeholder="Search tenant or room…" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
    {bills.error ? <ErrorState error={bills.error} onRetry={() => bills.refetch()} /> : bills.isPending ? <Skeleton className="h-48" /> : visible.length === 0 ?
      <EmptyState icon={Wallet} title={query ? 'No matching bills' : 'No unpaid bills'} description={query ? 'Try another tenant name or room number.' : 'Issued bills with an outstanding balance appear here.'} /> :
      <ul className="max-h-[48dvh] overflow-y-auto divide-y rounded-lg border">
        {visible.map((bill) => <li key={bill.id}><button type="button" onClick={() => onSelect(bill)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border text-xs font-semibold">{bill.room_number}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{bill.tenant_name}</span><span className="block text-xs text-muted-foreground">{formatPeriod(bill.period)} · Due {formatDate(bill.due_date, 'MMM d')}</span></span>
          <span className="flex shrink-0 flex-col items-end gap-1"><span className="text-sm font-semibold tabular">{formatMoney(bill.balance, currency)}</span>{bill.is_overdue && <StatusPill tone="destructive">Overdue</StatusPill>}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button></li>)}
      </ul>}
  </div>
}
