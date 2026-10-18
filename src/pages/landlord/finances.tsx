import { format, parseISO } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Download, FileText, Filter, Plus, Printer, Search, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ColumnChart } from '@/components/app/column-chart'
import { Fab } from '@/components/app/fab'
import { PageHeader } from '@/components/app/page-header'
import { IconChip, Panel, StatGrid, StatTile } from '@/components/app/panel'
import { ErrorState } from '@/components/app/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDeleteFinanceTransaction, useFinanceCategories, useFinanceReceiptUrl, useFinanceTransactions, type FinanceTransaction, type TransactionType, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/features/finances/api'
import { DailyCashReport } from '@/features/finances/daily-cash-report'
import { TransactionDialog } from '@/features/finances/transaction-dialog'
import { METHOD_LABEL } from '@/features/payments/api'
import { useRoomOverview } from '@/features/rooms/api'
import { useCurrency } from '@/hooks/use-settings'
import { currentPeriod, shiftPeriod, todayISO } from '@/lib/dates'
import { downloadCsv } from '@/lib/csv'
import { getErrorMessage } from '@/lib/errors'
import { formatCompact, formatDate, formatMoney } from '@/lib/format'

type TransactionTab = 'all' | TransactionType
type SortMode = 'newest' | 'oldest' | 'largest' | 'smallest'
const NONE = 'none'

const cents = (amount: number) => Math.round(amount * 100)
const amountFromCents = (amount: number) => amount / 100
const SERIES = [
  { name: 'Income', color: 'var(--chart-2)' },
  { name: 'Expenses', color: 'var(--chart-1)' },
]

function TransactionRow({
  item,
  currency,
  onEdit,
  onDelete,
}: {
  item: FinanceTransaction
  currency: string
  onEdit: (item: FinanceTransaction) => void
  onDelete: (item: FinanceTransaction) => void
}) {
  const income = item.transaction_type === 'income'
  const isManual = item.source === 'manual'
  const receipt = useFinanceReceiptUrl(item.receipt_path)
  return (
    <li className="flex min-w-0 items-start gap-3 border-b px-4 py-3 last:border-b-0 sm:px-5">
      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${income ? 'bg-success/10 text-success' : 'bg-destructive/8 text-destructive'}`}>
        {income ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="max-w-full truncate text-sm font-semibold">{item.description}</span>
          {!isManual && (
            <>
              <Badge variant="secondary" className="text-[10px]">Verified payment</Badge>
              <Link to="/payments" className="text-[11px] text-primary underline-offset-4 hover:underline print:hidden">Corrections in Payments</Link>
            </>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.category} <span aria-hidden>·</span> {formatDate(item.transaction_date)}
          {item.room_number && <> <span aria-hidden>·</span> Room {item.room_number}</>}
          {item.tenant_name && <> <span aria-hidden>·</span> {item.tenant_name}</>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular ${income ? 'text-success' : 'text-foreground'}`}>
          {income ? '+' : '−'}{formatMoney(item.amount, currency)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{METHOD_LABEL[item.method]}</p>
        {item.receipt_path && receipt.data && (
          <a className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline print:hidden" href={receipt.data} target="_blank" rel="noreferrer">
            <FileText className="size-3" /> Receipt
          </a>
        )}
        {item.receipt_path && receipt.error && <p className="mt-1 text-xs text-destructive">Receipt could not be loaded.</p>}
      </div>
      {isManual && (
        <div className="ml-1 flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2 print:hidden" onClick={() => onEdit(item)}>Edit</Button>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive print:hidden" onClick={() => onDelete(item)}>Delete</Button>
        </div>
      )}
    </li>
  )
}

export function FinancesPage() {
  const currency = useCurrency()
  const transactions = useFinanceTransactions()
  const rooms = useRoomOverview()
  const incomeCategories = useFinanceCategories('income')
  const expenseCategories = useFinanceCategories('expense')
  const remove = useDeleteFinanceTransaction()
  const [tab, setTab] = useState<TransactionTab>('all')
  const [dialogType, setDialogType] = useState<TransactionType>('income')
  const [typeChooserOpen, setTypeChooserOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceTransaction | undefined>()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [room, setRoom] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sort, setSort] = useState<SortMode>('newest')

  const allTransactions = useMemo(() => transactions.data ?? [], [transactions.data])
  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const item of allTransactions) {
      if (item.transaction_type === 'income') income += cents(item.amount)
      else expense += cents(item.amount)
    }
    return { income, expense, net: income - expense }
  }, [allTransactions])

  const monthly = useMemo(() => {
    const from = shiftPeriod(currentPeriod(), -11)
    const rows = Array.from({ length: 12 }, (_, index) => ({
      period: shiftPeriod(from, index),
      income: 0,
      expense: 0,
    }))
    for (const item of allTransactions) {
      const row = rows.find((month) => month.period.slice(0, 7) === item.transaction_date.slice(0, 7))
      if (!row) continue
      if (item.transaction_type === 'income') row.income += cents(item.amount)
      else row.expense += cents(item.amount)
    }
    return rows.map((row) => ({ ...row, cashFlow: row.income - row.expense }))
  }, [allTransactions])

  const currentMonth = monthly.at(-1) ?? { income: 0, expense: 0, cashFlow: 0 }
  const expenseByCategory = useMemo(() => {
    const categories = new Map<string, number>()
    for (const item of allTransactions) {
      if (item.transaction_type !== 'expense') continue
      categories.set(item.category, (categories.get(item.category) ?? 0) + cents(item.amount))
    }
    return [...categories].sort((a, b) => b[1] - a[1])
  }, [allTransactions])
  const expenseTotal = expenseByCategory.reduce((total, [, amount]) => total + amount, 0)
  const availableCategories = [...new Set([
    ...INCOME_CATEGORIES,
    ...EXPENSE_CATEGORIES,
    ...(incomeCategories.data ?? []).map((item) => item.name),
    ...(expenseCategories.data ?? []).map((item) => item.name),
  ])].sort()

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    const result = allTransactions.filter((item) => {
      if (tab !== 'all' && item.transaction_type !== tab) return false
      if (category !== 'all' && item.category !== category) return false
      if (room !== 'all' && (room === NONE ? item.room_id !== null : item.room_id !== room)) return false
      if (fromDate && item.transaction_date < fromDate) return false
      if (toDate && item.transaction_date > toDate) return false
      if (term && ![item.description, item.category, item.room_number ?? '', item.tenant_name ?? ''].join(' ').toLocaleLowerCase().includes(term)) return false
      return true
    })
    return result.sort((a, b) => {
      if (sort === 'oldest') return a.transaction_date.localeCompare(b.transaction_date) || a.created_at.localeCompare(b.created_at)
      if (sort === 'largest') return cents(b.amount) - cents(a.amount)
      if (sort === 'smallest') return cents(a.amount) - cents(b.amount)
      return b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at)
    })
  }, [allTransactions, tab, category, room, fromDate, toDate, search, sort])

  const recent = [...allTransactions].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at)).slice(0, 5)

  function printReport() {
    const clearPrintState = () => {
      document.body.classList.remove('print-finances')
      window.removeEventListener('afterprint', clearPrintState)
    }
    document.body.classList.add('print-finances')
    window.addEventListener('afterprint', clearPrintState)
    window.print()
  }

  function openNew(type: TransactionType) {
    setEditing(undefined)
    setDialogType(type)
    setDialogOpen(true)
  }

  function chooseTransactionType(type: TransactionType) {
    setTypeChooserOpen(false)
    openNew(type)
  }

  function edit(item: FinanceTransaction) {
    if (item.source !== 'manual') return
    setEditing(item)
    setDialogType(item.transaction_type)
    setDialogOpen(true)
  }

  function deleteTransaction(item: FinanceTransaction) {
    if (item.source !== 'manual') return
    if (!window.confirm(`Delete this ${item.transaction_type} record? It will be removed from totals but retained in the audit history.`)) return
    remove.mutate(item.id, {
      onSuccess: () => toast.success('Transaction deleted'),
      onError: (error) => toast.error(getErrorMessage(error)),
    })
  }

  function exportCsv() {
    downloadCsv(
      `rentlio-finances-${todayISO()}.csv`,
      ['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment method', 'Room', 'Tenant', 'Record source'],
      filtered.map((item) => [
        item.transaction_date,
        item.transaction_type,
        item.category,
        item.description,
        item.amount.toFixed(2),
        METHOD_LABEL[item.method],
        item.room_number ? `Room ${item.room_number}` : 'Entire property',
        item.tenant_name,
        item.source === 'payment' ? 'Verified payment' : 'Manual',
      ]),
    )
  }

  return (
    <div className="@container space-y-5">
      <PageHeader
        eyebrow="PROPERTY PERFORMANCE"
        title="Finances"
        description="A clear view of verified income and day-to-day property expenses."
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <DailyCashReport />
            <Button variant="outline" onClick={exportCsv} disabled={!transactions.data}><Download /> <span className="hidden sm:inline">Export CSV</span></Button>
            <Button variant="outline" onClick={printReport}><Printer /> <span className="hidden sm:inline">Print / PDF</span></Button>
            <Button className="hidden md:inline-flex" onClick={() => setTypeChooserOpen(true)}><Plus /> Add transaction</Button>
          </div>
        }
      />

      {transactions.error ? (
        <ErrorState error={transactions.error} onRetry={() => transactions.refetch()} />
      ) : transactions.isPending ? (
        <div className="surface h-48 animate-pulse" />
      ) : (
        <>
          <StatGrid>
            <StatTile label="Total income" value={formatMoney(amountFromCents(totals.income), currency)} icon={ArrowDownRight} sub={`${allTransactions.filter((item) => item.transaction_type === 'income').length} recorded transactions`} />
            <StatTile label="Total expenses" value={formatMoney(amountFromCents(totals.expense), currency)} icon={ArrowUpRight} sub={`${allTransactions.filter((item) => item.transaction_type === 'expense').length} recorded transactions`} />
            <StatTile label="Net profit" value={formatMoney(amountFromCents(totals.net), currency)} icon={Wallet} sub="Income minus expenses" />
            <StatTile label="This month" value={formatMoney(amountFromCents(currentMonth.cashFlow), currency)} icon={currentMonth.cashFlow < 0 ? ArrowUpRight : ArrowDownRight} sub={`${formatMoney(amountFromCents(currentMonth.income), currency)} in · ${formatMoney(amountFromCents(currentMonth.expense), currency)} out`} />
          </StatGrid>

          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-12">
            <Panel title="Income vs. expenses" description={`Monthly cash flow · last 12 months (${currency})`} className="@4xl:col-span-8">
              <ColumnChart
                ariaLabel="Monthly verified income and expenses for the past 12 months"
                series={SERIES}
                height={260}
                data={monthly.map((month) => ({
                  label: format(parseISO(month.period), 'MMM'),
                  title: format(parseISO(month.period), 'MMMM yyyy'),
                  values: [amountFromCents(month.income), amountFromCents(month.expense)],
                }))}
                formatValue={(value) => formatMoney(value, currency)}
                formatTick={formatCompact}
              />
              <p className="mt-3 text-xs text-muted-foreground">Only manually recorded income and verified bill payments are included. Unpaid bills are excluded.</p>
            </Panel>
            <Panel title="Expense breakdown" description="By category · all time" className="@4xl:col-span-4">
              {expenseByCategory.length ? (
                <ul className="space-y-4">
                  {expenseByCategory.slice(0, 7).map(([name, amount]) => {
                    const share = expenseTotal ? Math.round((amount / expenseTotal) * 100) : 0
                    return (
                      <li key={name}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium">{name}</span>
                          <span className="shrink-0 text-right text-xs text-muted-foreground tabular">{formatMoney(amountFromCents(amount), currency)} · {share}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-chart-1" style={{ width: `${share}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">Your expense breakdown will appear here.</p>}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-12">
            <Panel title="Recent transactions" description="Latest activity across your property" className="@4xl:col-span-5" flush>
              {recent.length ? (
                <ul>
                  {recent.map((item) => <TransactionRow key={item.id} item={item} currency={currency} onEdit={edit} onDelete={deleteTransaction} />)}
                </ul>
              ) : <p className="px-5 pb-5 text-sm text-muted-foreground">Transactions will appear here as you record income and expenses.</p>}
            </Panel>
            <Panel title="Quick actions" description="Keep your records up to date" className="@4xl:col-span-7">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => openNew('income')}
                  className="flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <IconChip icon={ArrowDownRight} accent="green" />
                  <span><span className="block text-sm font-semibold">Record income</span><span className="mt-1 block text-xs text-muted-foreground">Add rent, utilities, or other income.</span></span>
                </button>
                <button
                  type="button"
                  onClick={() => openNew('expense')}
                  className="flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <IconChip icon={ArrowUpRight} accent="blue" />
                  <span><span className="block text-sm font-semibold">Record expense</span><span className="mt-1 block text-xs text-muted-foreground">Track an operating cost or attach a receipt.</span></span>
                </button>
              </div>
            </Panel>
          </div>

          {(rooms.error || incomeCategories.error || expenseCategories.error) && (
            <p role="alert" className="text-sm text-destructive">
              Some filter options could not be loaded. {getErrorMessage(rooms.error ?? incomeCategories.error ?? expenseCategories.error)}
            </p>
          )}

          <Panel
            title="Transaction history"
            description={`${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'} · payment records are read-only and come from verified billing`}
            flush
          >
            <div className="space-y-4 border-b p-4 sm:p-5 print:hidden">
              <Tabs value={tab} onValueChange={(value) => setTab(value as TransactionTab)}>
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="all">All transactions</TabsTrigger>
                  <TabsTrigger value="income">Income</TabsTrigger>
                  <TabsTrigger value="expense">Expenses</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                <label className="relative sm:col-span-2 xl:col-span-2">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input aria-label="Search transactions" placeholder="Search description, tenant, room…" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger aria-label="Filter by category" className="w-full"><Filter className="size-4" /><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {availableCategories.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={room} onValueChange={setRoom}>
                  <SelectTrigger aria-label="Filter by room" className="w-full"><SelectValue placeholder="Room" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rooms</SelectItem>
                    <SelectItem value={NONE}>Entire property</SelectItem>
                    {(rooms.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>Room {item.room_number}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input aria-label="From date" title="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
                <Input aria-label="To date" title="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
                <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}>
                  <SelectTrigger aria-label="Sort transactions" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="largest">Largest first</SelectItem>
                    <SelectItem value="smallest">Smallest first</SelectItem>
                  </SelectContent>
                </Select>
                {(category !== 'all' || room !== 'all' || fromDate || toDate || search) && (
                  <Button variant="ghost" className="sm:col-span-2 xl:col-span-6 xl:justify-self-start" onClick={() => {
                    setCategory('all')
                    setRoom('all')
                    setFromDate('')
                    setToDate('')
                    setSearch('')
                  }}>Clear filters</Button>
                )}
              </div>
            </div>
            {filtered.length ? (
              <ul>
                {filtered.map((item) => <TransactionRow key={item.id} item={item} currency={currency} onEdit={edit} onDelete={deleteTransaction} />)}
              </ul>
            ) : (
              <div className="px-5 py-12 text-center">
                <FileText className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-3 text-sm font-medium">{allTransactions.length ? 'No transactions match these filters' : 'No transactions yet'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{allTransactions.length ? 'Try adjusting your search or date range.' : 'Your verified payment income and manual entries will show here.'}</p>
              </div>
            )}
          </Panel>
        </>
      )}
      <Dialog open={typeChooserOpen} onOpenChange={setTypeChooserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a transaction</DialogTitle>
            <DialogDescription>Choose the type of transaction you want to record.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => chooseTransactionType('income')}
              className="flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <IconChip icon={ArrowDownRight} accent="green" />
              <span><span className="block text-sm font-semibold">Income</span><span className="mt-1 block text-xs text-muted-foreground">Money received</span></span>
            </button>
            <button
              type="button"
              onClick={() => chooseTransactionType('expense')}
              className="flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <IconChip icon={ArrowUpRight} accent="blue" />
              <span><span className="block text-sm font-semibold">Expense</span><span className="mt-1 block text-xs text-muted-foreground">Property costs</span></span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {dialogOpen && (
        <TransactionDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          type={dialogType}
          transaction={editing}
        />
      )}
      <Fab icon={Plus} label="Add transaction" onClick={() => setTypeChooserOpen(true)} />
    </div>
  )
}
