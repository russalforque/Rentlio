import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoCashTransactions, demoReceiptText } from '../../src/features/demo-data/model.ts'
import { calculateDailyCashReport } from '../../src/features/finances/daily-cash-report-model.ts'
import type { DemoSnapshot } from '../../src/features/demo-data/types.ts'

const snapshot: DemoSnapshot = {
  batch: { id: 'batch', label: 'Demo fixture', starts_on: '2026-10-18', created_at: '2026-10-19', revision: 1 },
  today: '2026-10-19',
  counts: { batches: 1, tenants: 1, rooms: 1, leases: 1, bills: 1, bill_items: 3, payments: 5, payment_allocations: 5, expenses: 1, cash_openings: 1 },
  tenants: [], rooms: [], leases: [],
  bills: [{ id: 'bill', lease_id: 'lease', period: '2026-10-01', due_date: '2026-10-17', tenant_name: 'Ava Demo', room_number: 'DEMO-1', total_amount: 5345, amount_paid: 5345 }],
  bill_items: [
    { id: 'electricity', bill_id: 'bill', kind: 'electricity', description: 'Electricity', amount: 245, sort_order: 1 },
    { id: 'water', bill_id: 'bill', kind: 'water', description: 'Water', amount: 100, sort_order: 2 },
    { id: 'rent', bill_id: 'bill', kind: 'rent', description: 'Monthly rent', amount: 5000, sort_order: 0 },
  ],
  payments: [
    { id: 'combined', bill_id: 'bill', amount: 5345, method: 'cash', paid_on: '2026-10-19', status: 'verified', receipt_number: 1001, balance_before: 5345, balance_after: 0, rejection_reason: null, created_at: '2026-10-19' },
    { id: 'earlier', bill_id: 'prior-bill', amount: 1000, method: 'cash', paid_on: '2026-10-18', status: 'verified', receipt_number: 1000, balance_before: 5345, balance_after: 4345, rejection_reason: null, created_at: '2026-10-18' },
    { id: 'transfer', bill_id: 'other-bill', amount: 500, method: 'gcash', paid_on: '2026-10-19', status: 'verified', receipt_number: 1002, balance_before: 1000, balance_after: 500, rejection_reason: null, created_at: '2026-10-19' },
    { id: 'pending', bill_id: 'other-bill', amount: 10, method: 'cash', paid_on: '2026-10-19', status: 'pending', receipt_number: null, balance_before: null, balance_after: null, rejection_reason: null, created_at: '2026-10-19' },
    { id: 'rejected', bill_id: 'other-bill', amount: 10, method: 'cash', paid_on: '2026-10-19', status: 'rejected', receipt_number: null, balance_before: null, balance_after: null, rejection_reason: 'Demo rejection', created_at: '2026-10-19' },
  ],
  allocations: [
    { payment_id: 'combined', bill_item_id: 'electricity', bill_id: 'bill', kind: 'electricity', amount: 245 },
    { payment_id: 'combined', bill_item_id: 'water', bill_id: 'bill', kind: 'water', amount: 100 },
    { payment_id: 'combined', bill_item_id: 'rent', bill_id: 'bill', kind: 'rent', amount: 5000 },
    { payment_id: 'earlier', bill_item_id: 'rent2', bill_id: 'prior-bill', kind: 'rent', amount: 1000 },
    { payment_id: 'transfer', bill_item_id: 'rent3', bill_id: 'other-bill', kind: 'rent', amount: 500 },
  ],
  expenses: [{ id: 'expense', amount: 250, paid_on: '2026-10-19', description: 'Demo supplies' }],
  openings: [{ opening_date: '2026-10-18', opening_cash: 1000, updated_at: '2026-10-18', updated_by: 'owner' }],
}

test('demo cash uses the existing report engine and counts one combined collection once', () => {
  const report = calculateDailyCashReport(snapshot.today, demoCashTransactions(snapshot), [], snapshot.openings)
  assert.equal(report.beginningCash, 2000)
  assert.equal(report.income, 5345)
  assert.equal(report.expenses, 250)
  assert.equal(report.endingCash, 7095)
  assert.equal(report.incomeEntries.length, 1)
  assert.equal(report.incomeEntries[0]?.count, 1)
  assert.equal(report.incomeEntries[0]?.amount, 5345)
})
test('a demo opening overrides only the selected batch report and propagates forward', () => {
  const openings = [...snapshot.openings, { opening_date: snapshot.today, opening_cash: 50, updated_at: snapshot.today, updated_by: 'owner' }]
  const report = calculateDailyCashReport(snapshot.today, demoCashTransactions(snapshot), [], openings)
  assert.equal(report.beginningCash, 50)
  assert.equal(report.endingCash, 5145)
  assert.equal(calculateDailyCashReport('2026-10-20', demoCashTransactions(snapshot), [], openings).beginningCash, 5145)
  assert.equal(snapshot.openings.length, 1)
})
test('demo receipts are watermarked, use stored balances and allocations, and refuse unverified payments', () => {
  const text = demoReceiptText(snapshot, snapshot.payments[0]!)
  assert.match(text, /DEMO RECEIPT/)
  assert.match(text, /No money was transferred/)
  assert.match(text, /DEMO-batch-1001/)
  assert.match(text, /Electricity: ₱245\.00/)
  assert.match(text, /Water: ₱100\.00/)
  assert.match(text, /Monthly rent: ₱5,000\.00/)
  assert.match(text, /Collected: ₱5,345\.00/)
  assert.match(text, /Balance after: ₱0\.00/)
  assert.throws(() => demoReceiptText(snapshot, snapshot.payments[3]!), /Only verified/)
})
