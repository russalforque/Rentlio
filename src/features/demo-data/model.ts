import type { CashReportTransaction } from '../finances/daily-cash-report-model'
import type { DemoSnapshot, DemoPayment } from './types'

/** Adapt only the selected private batch to the existing cash calculation. */
export function demoCashTransactions(s: DemoSnapshot): CashReportTransaction[] {
  const transactions: CashReportTransaction[] = []
  for (const p of s.payments) {
    if (p.status !== 'verified') continue
    const bill = s.bills.find(b => b.id === p.bill_id)
    for (const a of s.allocations.filter(a => a.payment_id === p.id)) {
      transactions.push({ id: `${p.id}:${a.bill_item_id}`, amount: a.amount,
        category: a.kind === 'rent' ? 'Rental Income' : a.kind === 'other' ? 'Other Income' : 'Utility Payments',
        description: 'Demo collection', payment_id: p.id, room_number: bill?.room_number ?? null,
        source: 'payment', tenant_name: bill?.tenant_name ?? null,
        transaction_date: p.paid_on, transaction_type: 'income', method: p.method })
    }
  }
  for (const e of s.expenses) transactions.push({ id: e.id, amount: e.amount, category: 'Demo expense',
    description: e.description, payment_id: null, room_number: null, source: 'manual', tenant_name: null,
    transaction_date: e.paid_on, transaction_type: 'expense', method: 'cash' })
  return transactions
}

export const demoReceiptNumber = (s: DemoSnapshot, p: DemoPayment) =>
  `DEMO-${s.batch.id}-${p.receipt_number}`

/** Plain text keeps all names/descriptions inert when printed in a new document. */
export function demoReceiptText(s: DemoSnapshot, p: DemoPayment): string {
  if (p.status !== 'verified' || p.receipt_number === null) throw new Error('Only verified demo payments have receipts')
  const bill = s.bills.find(b => b.id === p.bill_id)
  if (!bill) throw new Error('Demo bill not found')
  const money = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
  const lines = s.allocations.filter(a => a.payment_id === p.id).map(a =>
    `${s.bill_items.find(i => i.id === a.bill_item_id)?.description ?? a.kind}: ${money(a.amount)}`)
  return ['RENTLIO · DEMO RECEIPT', 'Fictional data · No money was transferred', '',
    demoReceiptNumber(s, p), `Batch: ${s.batch.label}`, `Tenant: ${bill.tenant_name}`,
    `Room: ${bill.room_number}`, `Bill period: ${bill.period}`, `Paid on: ${p.paid_on}`,
    `Simulated method: ${p.method}`, '', ...lines, '', `Collected: ${money(p.amount)}`,
    `Balance before: ${money(p.balance_before ?? 0)}`, `Balance after: ${money(p.balance_after ?? 0)}`].join('\n')
}
