import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/app/confirm-dialog'
import { SettingsSection } from '@/components/app/panel'
import { NativeSelect } from '@/components/app/native-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useProfile } from '@/hooks/use-auth'
import { moneyInput } from '@/lib/form-fields'
import { formatMoney } from '@/lib/format'
import { calculateDailyCashReport } from '@/features/finances/daily-cash-report-model'
import { demoCashTransactions, demoReceiptText } from './model'
import { demoErrorMessage as getErrorMessage, fetchDemoBatch, useDeleteDemo, useDemoBatch, useDemoBatches, useDemoWrite, useGenerateDemo } from './api'
import { DEMO_COUNT_LABELS, type DemoCounts, type DemoDeletion, type DemoSnapshot } from './types'

const money = (amount: number) => formatMoney(amount, 'PHP')

function Counts({ counts }: { counts: DemoCounts }) {
  return <span className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
    {(Object.keys(DEMO_COUNT_LABELS) as (keyof DemoCounts)[]).map(key =>
      <span key={key} className="flex justify-between gap-3"><span>{DEMO_COUNT_LABELS[key]}</span><strong>{counts[key]}</strong></span>)}
  </span>
}

export function DemoDataSection() {
  const profile = useProfile()
  return profile.role === 'landlord' && profile.is_active ? <DemoManager /> : null
}

function DemoManager() {
  const list = useDemoBatches(), generate = useGenerateDemo(), remove = useDeleteDemo()
  const [selected, setSelected] = useState<string | null>(null)
  const [viewing, setViewing] = useState(false)
  const [preview, setPreview] = useState<DemoSnapshot | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [deletion, setDeletion] = useState<DemoDeletion | null>(null)
  const generationRequest = useRef(crypto.randomUUID())
  const batches = list.data ?? []
  const id = batches.some(b => b.id === selected) ? selected : batches[0]?.id ?? null
  const unavailable = list.error && 'code' in list.error && (list.error.code === 'PGRST202' || list.error.code === '42883')

  async function generateBatch() {
    try {
      const batchId = await generate.mutateAsync(generationRequest.current)
      generationRequest.current = crypto.randomUUID()
      setSelected(batchId); setViewing(true); setDeletion(null)
      toast.success('Demo batch generated')
    } catch (error) { toast.error(getErrorMessage(error)); void list.refetch() }
  }

  async function previewDeletion() {
    if (!id) return
    setLoadingPreview(true)
    try { setPreview(await fetchDemoBatch(id)) }
    catch (error) { toast.error(getErrorMessage(error)); void list.refetch() }
    finally { setLoadingPreview(false) }
  }

  async function deleteBatch() {
    if (!preview) return
    try {
      const result = await remove.mutateAsync({ id: preview.batch.id, revision: preview.batch.revision })
      setPreview(null); setDeletion(result); setViewing(false); setSelected(null)
      toast.success('Selected demo batch deleted')
    } catch (error) {
      setPreview(null) // A new explicit preview/confirmation is required after a stale revision.
      toast.error(getErrorMessage(error)); void list.refetch()
    }
  }

  return <SettingsSection id="demo-data" title="Demo Data" description="Create fictional tenants and bills to test collections, receipts and cash reports. Everything stays in the selected demo batch.">
    <p className="mb-4 text-sm text-muted-foreground">Demo only · No money transfers or payment notifications. Overpayments are rejected, matching the current payment policy.</p>
    {list.error && <div role="alert" className="mb-4 text-sm">
      {unavailable ? 'Demo Data is not installed on this database yet. Apply the demo sandbox migration before using these controls.' : getErrorMessage(list.error)}
      <Button className="ml-2" size="sm" variant="outline" onClick={() => void list.refetch()}>Retry</Button>
    </div>}
    <div className="flex flex-wrap items-end gap-3">
      <Button onClick={() => void generateBatch()} disabled={list.isPending || !!list.error || generate.isPending || remove.isPending}>
        {generate.isPending && <Loader2 className="animate-spin" />}Generate Demo Data
      </Button>
      {batches.length > 0 && <>
        <div className="min-w-48 flex-1"><Label htmlFor="demo-batch">Demo batch</Label>
          <NativeSelect id="demo-batch" className="mt-1" value={id ?? ''} disabled={remove.isPending || loadingPreview} onChange={e => { setSelected(e.target.value); setViewing(false) }}>
            {batches.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </NativeSelect>
        </div>
        <Button variant="outline" disabled={remove.isPending} onClick={() => setViewing(true)}>View Demo Records</Button>
        <Button variant="outline" disabled={remove.isPending || loadingPreview} onClick={() => void previewDeletion()}>
          {loadingPreview && <Loader2 className="animate-spin" />}Delete Demo Data
        </Button>
      </>}
    </div>
    {deletion && <div role="status" className="mt-4 rounded-xl border p-4">
      <p className="mb-2 font-medium">Demo batch deleted</p><p className="mb-3 break-all text-xs text-muted-foreground">{deletion.batch_id}</p><Counts counts={deletion.removed} />
    </div>}
    <Dialog open={viewing && id !== null} onOpenChange={setViewing}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader><DialogTitle>Demo Records</DialogTitle><DialogDescription>Fictional billing and simulated collections. Receipts are clearly marked DEMO.</DialogDescription></DialogHeader>
        {id && <DemoWorkspace key={id} batchId={id} />}
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={preview !== null} onOpenChange={open => { if (!open && !remove.isPending) setPreview(null) }} title="Delete Demo Data?"
      description={preview && <><span className="mb-3 block">Permanently delete only <strong>{preview.batch.label}</strong> and the following records. This cannot be undone.</span><Counts counts={preview.counts} /></>}
      confirmLabel="Delete selected demo batch" destructive pending={remove.isPending} onConfirm={() => void deleteBatch()} />
  </SettingsSection>
}

function DemoWorkspace({ batchId }: { batchId: string }) {
  const query = useDemoBatch(batchId)
  if (query.isPending) return <p role="status">Loading demo records…</p>
  if (query.error) return <div role="alert">{getErrorMessage(query.error)}<Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>
  return <DemoRecords snapshot={query.data} />
}

function DemoRecords({ snapshot: s }: { snapshot: DemoSnapshot }) {
  const write = useDemoWrite()
  const [billId, setBillId] = useState(s.bills.find(b => b.total_amount > b.amount_paid)?.id ?? s.bills[0]?.id ?? '')
  const [amount, setAmount] = useState('5345'), [method, setMethod] = useState('cash'), [status, setStatus] = useState('verified')
  const [date, setDate] = useState(s.today), [reportDate, setReportDate] = useState(s.today)
  const [opening, setOpening] = useState(''), [expense, setExpense] = useState(''), [description, setDescription] = useState('Demo expense')
  const [rejection, setRejection] = useState<string | null>(null), [reason, setReason] = useState('Fictional proof rejected')
  // Retain a request ID across uncertain network failures. A successful new
  // attempt or changed form gets a different ID; server rejects altered reuse.
  const paymentRequest = useRef({ key: '', id: crypto.randomUUID() })
  const expenseRequest = useRef({ key: '', id: crypto.randomUUID() })
  const report = calculateDailyCashReport(reportDate, demoCashTransactions(s), [], s.openings)
  const dailyCollections = s.payments.filter(p => p.status === 'verified' && p.paid_on === reportDate)
  const dailyCollected = dailyCollections.reduce((total, p) => total + Math.round(p.amount * 100), 0) / 100
  const bill = s.bills.find(b => b.id === billId)

  async function recordPayment(event: React.FormEvent) {
    event.preventDefault()
    try {
      const value = moneyInput().refine(n => n > 0, 'Enter an amount greater than zero').parse(amount)
      const key = JSON.stringify([billId, value, method, date, status])
      const request = paymentRequest.current.key === key ? paymentRequest.current : { key, id: crypto.randomUUID() }
      paymentRequest.current = request
      await write.mutateAsync({ name: 'demo_record_payment', args: { p_batch_id: s.batch.id, p_bill_id: billId, p_amount: value,
        p_method: method, p_paid_on: date, p_request_id: request.id, p_status: status } })
      paymentRequest.current = { key: '', id: crypto.randomUUID() }
      toast.success(status === 'pending' ? 'Demo payment awaiting review' : 'Demo collection recorded')
    } catch (error) { toast.error(getErrorMessage(error)) }
  }

  async function review(paymentId: string, approve: boolean) {
    try {
      await write.mutateAsync({ name: 'demo_review_payment', args: { p_batch_id: s.batch.id, p_payment_id: paymentId, p_approve: approve, p_reason: approve ? undefined : reason } })
      setRejection(null); toast.success(approve ? 'Demo payment approved' : 'Demo payment rejected')
    } catch (error) { toast.error(getErrorMessage(error)) }
  }

  async function saveCash(event: React.FormEvent, kind: 'opening' | 'expense') {
    event.preventDefault()
    try {
      const value = moneyInput().refine(n => kind === 'opening' || n > 0, 'Enter an amount greater than zero').parse(kind === 'opening' ? opening : expense)
      if (kind === 'opening') await write.mutateAsync({ name: 'demo_save_cash_opening', args: { p_batch_id: s.batch.id, p_date: reportDate, p_amount: value } })
      else {
        const key = JSON.stringify([reportDate, value, description])
        const request = expenseRequest.current.key === key ? expenseRequest.current : { key, id: crypto.randomUUID() }
        expenseRequest.current = request
        await write.mutateAsync({ name: 'demo_record_expense', args: { p_batch_id: s.batch.id, p_date: reportDate, p_amount: value, p_description: description, p_request_id: request.id } })
        expenseRequest.current = { key: '', id: crypto.randomUUID() }; setExpense('')
      }
      toast.success(kind === 'opening' ? 'Demo opening saved' : 'Demo expense recorded')
    } catch (error) { toast.error(getErrorMessage(error)) }
  }

  return <div className="space-y-6">
    <p className="break-all text-xs text-muted-foreground">{s.batch.label} · {s.batch.id}</p>
    <div className="grid gap-3 sm:grid-cols-4">{s.bills.map(b => <div key={b.id} className="rounded-xl border p-3 text-sm">
      <p className="font-semibold">{b.room_number}</p><p className="mt-1 text-xs">{b.tenant_name}</p>
      <p className="mt-2">Billed {money(b.total_amount)}</p><p>Paid {money(b.amount_paid)}</p><p className="font-medium">Balance {money(b.total_amount - b.amount_paid)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{b.total_amount === b.amount_paid ? 'Paid' : b.amount_paid > 0 ? 'Partial' : 'Unpaid'}{b.due_date < s.today && b.total_amount > b.amount_paid ? ' · Overdue' : ''}</p>
      <p className="mt-1 text-xs text-muted-foreground">Due {b.due_date} · Period {b.period}</p>
    </div>)}</div>
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Record a demo payment</h3>
      <form onSubmit={event => void recordPayment(event)} className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><Label htmlFor="demo-bill">Monthly bill</Label><NativeSelect id="demo-bill" value={billId} onChange={e => setBillId(e.target.value)}>
          {s.bills.map(b => <option key={b.id} value={b.id}>{b.room_number} · {b.tenant_name} · {money(b.total_amount - b.amount_paid)} due</option>)}
        </NativeSelect></div>
        <div><Label htmlFor="demo-amount">Amount (PHP)</Label><Input id="demo-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
        <div><Label htmlFor="demo-method">Simulated method</Label><NativeSelect id="demo-method" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="cash">Cash</option><option value="gcash">GCash (simulation)</option><option value="maya">Maya (simulation)</option><option value="bank_transfer">Bank transfer (simulation)</option><option value="other">Other</option>
        </NativeSelect></div>
        <div><Label htmlFor="demo-date">Payment date</Label><Input id="demo-date" type="date" min={s.batch.starts_on} max={s.today} value={date} onChange={e => setDate(e.target.value)} required /></div>
        <div><Label htmlFor="demo-status">Collection type</Label><NativeSelect id="demo-status" value={status} onChange={e => setStatus(e.target.value)}><option value="verified">Verified collection</option><option value="pending">Simulated proof for review</option></NativeSelect></div>
        <p className="text-xs text-muted-foreground sm:col-span-3">{bill && s.bill_items.filter(i => i.bill_id === bill.id).map(i => `${i.description}: ${money(i.amount)}`).join(' · ')}. Allocation order: electricity, water, other charges, rent.</p>
        <Button type="submit" disabled={write.isPending}>Record demo payment</Button>
      </form>
    </section>
    <section className="space-y-3"><h3 className="font-semibold">Payment history & receipts</h3>
      <div className="space-y-2">{[...s.payments].reverse().map(p => {
        const b = s.bills.find(b => b.id === p.bill_id)
        return <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm">
          <div><p className="font-medium">{b?.room_number} · {money(p.amount)} · {p.status}</p><p className="text-xs text-muted-foreground">{p.paid_on} · {p.method}</p>
            <p className="mt-1 text-xs">{s.allocations.filter(a => a.payment_id === p.id).map(a => `${a.kind}: ${money(a.amount)}`).join(' · ') || 'No amount allocated'}</p>
            {p.rejection_reason && <p className="text-xs">{p.rejection_reason}</p>}</div>
          <div className="flex gap-2">{p.status === 'pending' && <><Button size="sm" disabled={write.isPending} onClick={() => void review(p.id, true)}>Approve</Button><Button size="sm" variant="outline" disabled={write.isPending} onClick={() => setRejection(p.id)}>Reject</Button></>}
            {p.status === 'verified' && <Button size="sm" variant="outline" onClick={() => {
              const receipt = demoReceiptText(s, p)
              const popup = window.open('', '_blank', 'width=720,height=800')
              if (!popup) { toast.error('Allow pop-ups to print the demo receipt'); return }
              popup.opener = null
              popup.document.title = 'Rentlio — DEMO receipt'
              const pre = popup.document.createElement('pre')
              pre.style.cssText = 'white-space:pre-wrap;font:15px/1.8 system-ui;padding:32px;color:#111;background:white'
              pre.textContent = receipt
              popup.document.body.appendChild(pre)
              popup.focus(); popup.print()
            }}>Receipt / Print PDF</Button>}</div>
        </div>
      })}</div>
    </section>
    <section className="space-y-4 rounded-xl border p-4"><h3 className="font-semibold">Demo daily cash report</h3>
      <div className="max-w-56"><Label htmlFor="demo-report-date">Report date</Label><Input id="demo-report-date" type="date" min={s.batch.starts_on} max={s.today} value={reportDate} onChange={e => setReportDate(e.target.value || s.today)} required /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Beginning cash', report.beginningCash], ['Cash income', report.income], ['Cash expenses', report.expenses], ['Ending cash', report.endingCash]].map(([label, value]) =>
        <div key={label} className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{money(Number(value))}</p></div>)}</div>
      <p className="text-sm">Verified collections across all simulated methods: <strong>{money(dailyCollected)}</strong> · {dailyCollections.length} {dailyCollections.length === 1 ? 'collection' : 'collections'}</p>
      <p className="text-xs text-muted-foreground">Cash methods only. Prior-day collections carry forward. A saved opening replaces the computed beginning balance for its date.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <form className="space-y-2" onSubmit={event => void saveCash(event, 'opening')}><Label htmlFor="demo-opening">Opening cash for {reportDate}</Label><Input id="demo-opening" inputMode="decimal" placeholder={String(report.beginningCash)} value={opening} onChange={e => setOpening(e.target.value)} required /><Button variant="outline" disabled={write.isPending}>Save demo opening</Button></form>
        <form className="space-y-2" onSubmit={event => void saveCash(event, 'expense')}><Label htmlFor="demo-expense">Cash expense for {reportDate}</Label><Input id="demo-expense" inputMode="decimal" placeholder="Amount in PHP" value={expense} onChange={e => setExpense(e.target.value)} required /><Label htmlFor="demo-expense-description">Description</Label><Input id="demo-expense-description" value={description} maxLength={300} onChange={e => setDescription(e.target.value)} required /><Button variant="outline" disabled={write.isPending}>Record demo expense</Button></form>
      </div>
      <div className="grid gap-4 text-sm sm:grid-cols-2"><div><p className="mb-2 font-medium">Daily cash income</p>{report.incomeEntries.map(e => <p key={e.id} className="flex justify-between gap-3"><span>{e.label}</span><span>{money(e.amount)}</span></p>)}</div><div><p className="mb-2 font-medium">Daily cash expenses</p>{report.expenseEntries.map(e => <p key={e.id} className="flex justify-between gap-3"><span>{e.label}</span><span>{money(e.amount)}</span></p>)}</div></div>
    </section>
    <details className="rounded-xl border p-4 text-sm"><summary className="cursor-pointer font-medium">All demo records & deletion counts</summary><div className="mt-3 space-y-3"><Counts counts={s.counts} />
      {s.leases.map(l => <p key={l.id}>{s.tenants.find(t => t.id === l.tenant_id)?.full_name} · {s.rooms.find(r => r.id === l.room_id)?.room_number} · {money(l.monthly_rent)}/month · agreement starts {l.start_date}</p>)}
    </div></details>
    <Dialog open={rejection !== null} onOpenChange={open => { if (!open) setRejection(null) }}><DialogContent><DialogHeader><DialogTitle>Reject demo payment</DialogTitle><DialogDescription>This simulated payment will remain in demo history with its reason.</DialogDescription></DialogHeader><Label htmlFor="demo-rejection">Reason</Label><Input id="demo-rejection" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /><Button disabled={write.isPending || !reason.trim()} onClick={() => { if (rejection) void review(rejection, false) }}>Reject demo payment</Button></DialogContent></Dialog>
  </div>
}
