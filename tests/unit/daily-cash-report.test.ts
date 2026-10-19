import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calculateDailyCashReport } from '../../src/features/finances/daily-cash-report-model.ts'

const transaction = (overrides: Partial<{
  id: string
  amount: number
  category: string
  description: string
  payment_id: string | null
  room_number: string | null
  source: string
  tenant_name: string | null
  transaction_date: string
  transaction_type: string
  method: string
}> = {}) => ({
  id: 'manual-1',
  amount: 100,
  category: 'Other Income',
  description: 'Manual entry',
  payment_id: null,
  room_number: null,
  source: 'manual',
  tenant_name: null,
  transaction_date: '2026-10-18',
  transaction_type: 'income',
  method: 'cash',
  ...overrides,
})

describe('daily cash report', () => {
  test('ending cash stays exact at centavo precision', () => {
    const report = calculateDailyCashReport('2026-10-18', [
      transaction({ amount: 0.1, transaction_date: '2026-10-17' }),
      transaction({ id: 'income', amount: 0.2 }),
      transaction({ id: 'expense', amount: 0.1, transaction_type: 'expense' }),
    ], [])
    assert.equal(report.endingCash, 0.2)
  })
  test('carries forward cash movements and applies dated opening adjustments', () => {
    const report = calculateDailyCashReport(
      '2026-10-18',
      [
        transaction({ amount: 500, transaction_date: '2026-10-16' }),
        transaction({ id: 'expense-prior', amount: 50.25, transaction_date: '2026-10-17', transaction_type: 'expense' }),
        transaction({ id: 'gcash', amount: 99, transaction_date: '2026-10-17', method: 'gcash' }),
        transaction({ id: 'today-income', amount: 200 }),
        transaction({ id: 'today-expense', amount: 75.5, transaction_type: 'expense' }),
        transaction({ id: 'future', amount: 1_000, transaction_date: '2026-10-19' }),
      ],
      [
        { adjustment_date: '2026-10-17', amount_delta: 25.25 },
        { adjustment_date: '2026-10-18', amount_delta: -10 },
        { adjustment_date: '2026-10-19', amount_delta: 500 },
      ],
    )

    assert.equal(report.date, '2026-10-18')
    assert.equal(report.beginningCash, 465)
    assert.equal(report.income, 200)
    assert.equal(report.expenses, 75.5)
    assert.equal(report.endingCash, 589.5)
    assert.deepEqual(report.incomeEntries.map(({ amount }) => amount), [200])
    assert.deepEqual(report.expenseEntries.map(({ amount }) => amount), [75.5])
  })

  test('counts verified payment allocations once and excludes non-cash or pending data', () => {
    // The financial read model returns a verified payment once per allocated
    // charge kind, so those distinct parts add up to the tendered amount.
    const report = calculateDailyCashReport(
      '2026-10-18',
      [
        transaction({ id: 'part-rent', amount: 800, payment_id: 'payment-one', room_number: '08' }),
        transaction({ id: 'part-utilities', amount: 200, payment_id: 'payment-one', room_number: '08' }),
        transaction({ id: 'transfer', amount: 450, method: 'bank_transfer' }),
      ],
      [],
    )

    assert.equal(report.income, 1_000)
    assert.equal(report.endingCash, 1_000)
  })

  test('uses integer cents for accurate fractional amounts', () => {
    const report = calculateDailyCashReport(
      '2026-10-18',
      [
        transaction({ id: 'one', amount: 0.1 }),
        transaction({ id: 'two', amount: 0.2 }),
      ],
      [],
    )

    assert.equal(report.income, 0.3)
    assert.equal(report.endingCash, 0.3)
  })

  test('combines partial tenant payment allocations into one cash income entry', () => {
    const report = calculateDailyCashReport(
      '2026-10-18',
      [
        transaction({ id: 'rent', amount: 4_500, category: 'Rental Income', payment_id: 'p1', room_number: '08', tenant_name: 'Tenant A' }),
        transaction({ id: 'electricity', amount: 695, category: 'Utility Payments', payment_id: 'p1', room_number: '08', tenant_name: 'Tenant A' }),
        transaction({ id: 'water', amount: 150, category: 'Utility Payments', payment_id: 'p1', room_number: '08', tenant_name: 'Tenant A' }),
        transaction({ id: 'gcash-rent', amount: 1_000, payment_id: 'p2', method: 'gcash' }),
      ],
      [],
    )

    assert.equal(report.income, 5_345)
    assert.deepEqual(report.incomeEntries, [{
      id: 'p1',
      label: 'Room 08 — Tenant Payment',
      amount: 5_345,
      count: 1,
    }])
  })

  test('summarizes many expenses by category with transaction counts and exact totals', () => {
    const report = calculateDailyCashReport(
      '2026-10-18',
      Array.from({ length: 9 }, (_, index) => transaction({
        id: `expense-${index}`,
        amount: 100 + index,
        category: index % 2 ? 'Supplies' : 'Maintenance',
        description: `Expense ${index}`,
        transaction_type: 'expense',
      })),
      [],
    )

    assert.equal(report.expenses, 936)
    assert.deepEqual(report.expenseEntries, [
      { id: 'Maintenance', label: 'Maintenance · 5 transactions', amount: 520, count: 5 },
      { id: 'Supplies', label: 'Supplies · 4 transactions', amount: 416, count: 4 },
    ])
    assert.equal(report.endingCash, -936)
  })

  test('keeps tenant payments itemized while summarizing many expense categories', () => {
    const report = calculateDailyCashReport(
      '2026-10-18',
      [
        ...Array.from({ length: 10 }, (_, index) => transaction({
          id: `payment-${index}`,
          amount: 100,
          payment_id: `p-${index}`,
          room_number: String(index + 1).padStart(2, '0'),
        })),
        ...Array.from({ length: 8 }, (_, index) => transaction({
          id: `expense-category-${index}`,
          amount: 25 + index,
          category: `Category ${index + 1}`,
          transaction_type: 'expense',
        })),
      ],
      [],
    )

    assert.equal(report.incomeEntries.length, 10)
    assert.equal(new Set(report.incomeEntries.map((entry) => entry.id)).size, 10)
    assert.equal(report.incomeEntries.reduce((sum, entry) => sum + entry.amount, 0), report.income)
    assert.equal(report.expenseEntries.length, 6)
    assert.equal(report.expenseEntries.at(-1)?.label, 'Other categories · 3 transactions')
    assert.equal(report.expenseEntries.reduce((sum, entry) => sum + entry.amount, 0), report.expenses)
    assert.equal(report.endingCash, 1_000 - report.expenses)
  })

  test('keeps a short daily report for few transactions and leaves other income itemized', () => {
    const report = calculateDailyCashReport(
      '2026-10-18',
      [
        transaction({ id: 'payment-a', amount: 250, payment_id: 'p1', room_number: '08' }),
        transaction({ id: 'manual-a', amount: 80, description: 'Key replacement', category: 'Other Income' }),
        transaction({ id: 'expense-a', amount: 25, category: 'Supplies', description: 'Cleaning cloths', transaction_type: 'expense' }),
      ],
      [],
    )

    assert.deepEqual(report.incomeEntries.map(({ label, amount }) => [label, amount]), [
      ['Room 08 — Tenant Payment', 250],
      ['Key replacement', 80],
    ])
    assert.deepEqual(report.expenseEntries.map(({ label, amount }) => [label, amount]), [['Cleaning cloths', 25]])
    assert.equal(report.endingCash, 305)
  })

  test('defaults beginning cash to prior-day ending and flags an explicit opening override', () => {
    const transactions = [
      transaction({ id: 'prior-income', amount: 125, transaction_date: '2026-10-17' }),
      transaction({ id: 'prior-expense', amount: 25, transaction_date: '2026-10-17', transaction_type: 'expense' }),
      transaction({ id: 'today-income', amount: 30, transaction_date: '2026-10-18' }),
    ]
    const opening = {
      opening_date: '2026-10-17',
      opening_cash: 1_000,
      updated_at: '2026-10-17T12:00:00Z',
      updated_by: 'landlord-id',
    }

    const carried = calculateDailyCashReport('2026-10-18', transactions, [], [opening])
    assert.equal(carried.previousDayEnding, 1_100)
    assert.equal(carried.beginningCash, 1_100)

    const overridden = calculateDailyCashReport(
      '2026-10-18',
      transactions,
      [],
      [opening, { ...opening, opening_date: '2026-10-18', opening_cash: 900 }],
    )
    assert.equal(overridden.previousDayEnding, 1_100)
    assert.equal(overridden.beginningCash, 900)
    assert.equal(overridden.savedOpening?.updated_by, 'landlord-id')
    assert.equal(overridden.endingCash, 930)
  })

  test('uses a later saved daily opening as the carry-forward anchor', () => {
    const opening = {
      opening_date: '2026-10-17',
      opening_cash: 800,
      updated_at: '2026-10-17T12:00:00Z',
      updated_by: 'landlord-id',
    }
    const transactions = [
      transaction({ id: 'first-day-cash-in', amount: 80, transaction_date: '2026-10-17' }),
      transaction({ id: 'next-day-cash-in', amount: 20, transaction_date: '2026-10-18' }),
    ]
    const report = calculateDailyCashReport('2026-10-19', transactions, [], [opening])

    assert.equal(report.previousDayEnding, 900)
    assert.equal(report.beginningCash, 900)
  })
})
