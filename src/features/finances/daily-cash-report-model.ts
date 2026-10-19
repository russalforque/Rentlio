export interface CashReportTransaction {
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
}

export interface CashReportAdjustment {
  adjustment_date: string
  amount_delta: number
}

export interface CashReportOpening {
  opening_date: string
  opening_cash: number
  updated_at: string
  updated_by: string
}

export interface DailyCashReport {
  date: string
  beginningCash: number
  previousDayEnding: number
  savedOpening: CashReportOpening | null
  incomeEntries: CashReportEntry[]
  income: number
  expenseEntries: CashReportEntry[]
  expenses: number
  endingCash: number
}

export interface CashReportEntry {
  id: string
  label: string
  amount: number
  count: number
}

const cents = (amount: number) => Math.round(amount * 100)

function summarizeBy<T>(
  entries: T[],
  keyOf: (entry: T) => string,
  labelOf: (key: string, count: number) => string,
  amountOf: (entry: T) => number,
): CashReportEntry[] {
  const grouped = new Map<string, { amount: number; count: number }>()
  for (const entry of entries) {
    const key = keyOf(entry)
    const group = grouped.get(key) ?? { amount: 0, count: 0 }
    group.amount += cents(amountOf(entry))
    group.count += 1
    grouped.set(key, group)
  }
  return [...grouped].map(([key, group]) => ({
    id: key,
    label: labelOf(key, group.count),
    amount: group.amount / 100,
    count: group.count,
  }))
}

export function calculateDailyCashReport(
  date: string,
  transactions: CashReportTransaction[],
  adjustments: CashReportAdjustment[],
  openings: CashReportOpening[] = [],
): DailyCashReport {
  let income = 0
  let expenses = 0
  const dailyCashTransactions: CashReportTransaction[] = []
  const cashTransactions = transactions.filter((transaction) => transaction.method === 'cash')
  for (const transaction of cashTransactions) {
    if (transaction.transaction_date !== date) continue
    dailyCashTransactions.push(transaction)
    const amount = cents(transaction.amount)
    if (transaction.transaction_type === 'income') income += amount
    else if (transaction.transaction_type === 'expense') expenses += amount
  }

  const sortedOpenings = [...openings].sort((a, b) => b.opening_date.localeCompare(a.opening_date))
  const balanceAtEndOf = (endDate: string) => {
    const anchor = sortedOpenings.find((opening) => opening.opening_date <= endDate)
    let balance = anchor ? cents(anchor.opening_cash) : 0
    for (const transaction of cashTransactions) {
      const afterAnchor = !anchor || transaction.transaction_date >= anchor.opening_date
      if (!afterAnchor || transaction.transaction_date > endDate) continue
      const amount = cents(transaction.amount)
      balance += transaction.transaction_type === 'income' ? amount : -amount
    }
    for (const adjustment of adjustments) {
      const afterAnchor = !anchor || adjustment.adjustment_date > anchor.opening_date
      if (afterAnchor && adjustment.adjustment_date <= endDate) balance += cents(adjustment.amount_delta)
    }
    return balance
  }

  const previousDate = new Date(`${date}T00:00:00Z`)
  previousDate.setUTCDate(previousDate.getUTCDate() - 1)
  const previousDay = previousDate.toISOString().slice(0, 10)
  const previousDayEnding = balanceAtEndOf(previousDay) / 100
  const savedOpening = sortedOpenings.find((opening) => opening.opening_date === date) ?? null
  const beginningCash = savedOpening
    ? cents(savedOpening.opening_cash) / 100
    : (cents(previousDayEnding)
      + adjustments
        .filter((adjustment) => adjustment.adjustment_date === date)
        .reduce((sum, adjustment) => sum + cents(adjustment.amount_delta), 0)) / 100
  income /= 100
  expenses /= 100

  const payments = new Map<string, CashReportTransaction[]>()
  const otherIncome: CashReportTransaction[] = []
  const dailyExpenses: CashReportTransaction[] = []
  for (const transaction of dailyCashTransactions) {
    if (transaction.transaction_type === 'expense') {
      dailyExpenses.push(transaction)
    } else if (transaction.payment_id) {
      const payment = payments.get(transaction.payment_id) ?? []
      payment.push(transaction)
      payments.set(transaction.payment_id, payment)
    } else {
      otherIncome.push(transaction)
    }
  }

  const incomeEntries: CashReportEntry[] = [
    ...[...payments].map(([paymentId, allocations]) => {
      const total = allocations.reduce((sum, item) => sum + cents(item.amount), 0)
      const roomNumber = allocations[0]?.room_number
      return {
        id: paymentId,
        label: roomNumber ? `Room ${roomNumber} — Tenant Payment` : 'Tenant Payment',
        amount: total / 100,
        count: 1,
      }
    }),
    ...otherIncome.map((transaction) => ({
      id: transaction.id,
      label: transaction.description,
      amount: cents(transaction.amount) / 100,
      count: 1,
    })),
  ]
  const expenseEntries: CashReportEntry[] = dailyExpenses.map((transaction) => ({
    id: transaction.id,
    label: transaction.description,
    amount: cents(transaction.amount) / 100,
    count: 1,
  }))

  const expenseCategoryTotals = expenseEntries.length > 6
    ? summarizeBy(
        dailyExpenses,
        (entry) => entry.category,
        (category, count) => `${category} · ${count} ${count === 1 ? 'transaction' : 'transactions'}`,
        (entry) => entry.amount,
      )
    : expenseEntries
  const compactExpenseEntries = expenseCategoryTotals.length > 6
    ? [
        ...expenseCategoryTotals
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5),
        (() => {
          const remaining = expenseCategoryTotals.slice(5)
          return {
            id: 'other-expense-categories',
            label: `Other categories · ${remaining.reduce((count, entry) => count + entry.count, 0)} transactions`,
            amount: remaining.reduce((total, entry) => total + cents(entry.amount), 0) / 100,
            count: remaining.reduce((count, entry) => count + entry.count, 0),
          }
        })(),
      ]
    : expenseCategoryTotals

  return {
    date,
    beginningCash,
    previousDayEnding,
    savedOpening,
    incomeEntries,
    income,
    expenseEntries: compactExpenseEntries,
    expenses,
    endingCash: (cents(beginningCash) + cents(income) - cents(expenses)) / 100,
  }
}
