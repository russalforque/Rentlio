import { FileText, Plus, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ResponsiveSheet } from '@/components/app/responsive-sheet'
import { useSheetFormState } from '@/hooks/use-sheet-form-state'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { METHOD_LABEL } from '@/features/payments/api'
import { useTenants } from '@/features/tenants/api'
import { useRoomOverview } from '@/features/rooms/api'
import type { Enums } from '@/lib/database.types'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  useAddFinanceCategory,
  useFinanceCategories,
  useFinanceReceiptUrl,
  useSaveFinanceTransaction,
  validateFinancialReceipt,
  type FinanceTransaction,
  type TransactionType,
} from '@/features/finances/api'
import { getErrorMessage } from '@/lib/errors'
import { todayISO } from '@/lib/dates'

interface TransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: TransactionType
  transaction?: FinanceTransaction
}

const NONE = 'none'

export function TransactionDialog(props: TransactionDialogProps) {
  return <ResponsiveSheet open={props.open} onOpenChange={props.onOpenChange}><TransactionForm {...props} /></ResponsiveSheet>
}

function TransactionForm({ onOpenChange, type, transaction }: TransactionDialogProps) {
  const rooms = useRoomOverview()
  const tenants = useTenants()
  const categories = useFinanceCategories(type)
  const save = useSaveFinanceTransaction()
  const addCategory = useAddFinanceCategory()
  const receiptUrl = useFinanceReceiptUrl(transaction?.receipt_path ?? null)

  const [amount, setAmount] = useState(transaction?.amount.toFixed(2) ?? '')
  const [category, setCategory] = useState(transaction?.category ?? '')
  const [date, setDate] = useState(transaction?.transaction_date ?? todayISO())
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [method, setMethod] = useState<Enums<'payment_method'>>(transaction?.method ?? 'cash')
  const [roomId, setRoomId] = useState(transaction?.room_id ?? NONE)
  const [tenantId, setTenantId] = useState(transaction?.tenant_id ?? NONE)
  const [file, setFile] = useState<File | null>(null)
  const [clearReceipt, setClearReceipt] = useState(false)
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [validation, setValidation] = useState<Record<string, string>>({})
  const [requestId] = useState(() => crypto.randomUUID())
  const dirty = amount !== (transaction?.amount.toFixed(2) ?? '') || category !== (transaction?.category ?? '')
    || date !== (transaction?.transaction_date ?? todayISO()) || description !== (transaction?.description ?? '')
    || method !== (transaction?.method ?? 'cash') || roomId !== (transaction?.room_id ?? NONE)
    || tenantId !== (transaction?.tenant_id ?? NONE) || !!file || clearReceipt
  useSheetFormState(dirty, save.isPending)

  const builtIns = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const categoryNames = [...builtIns, ...(categories.data ?? []).map((item) => item.name)]
  const optionError = categories.error ?? rooms.error ?? (type === 'income' ? tenants.error : null)
  const title = transaction ? `Edit ${type}` : `Add ${type}`

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (save.isPending) return
    const trimmedDescription = description.trim()
    const decimal = /^\d{1,10}(?:\.\d{1,2})?$/
    const issues: Record<string, string> = {}
    if (!decimal.test(amount) || Number(amount) <= 0) issues.amount = 'Enter an amount greater than zero with up to two decimal places.'
    if (!category) issues.category = 'Choose a category.'
    if (!trimmedDescription) issues.description = 'Describe this transaction.'
    if (!date || date > todayISO()) issues.date = 'Choose today or an earlier date.'
    setValidation(issues)
    if (Object.keys(issues).length) return
    if (file) {
      const issue = validateFinancialReceipt(file)
      if (issue) {
        toast.error(issue)
        return
      }
    }
    save.mutate(
      {
        requestId,
        id: transaction?.source === 'manual' ? transaction.id : undefined,
        transactionType: type,
        amount: Math.round(Number(amount) * 100) / 100,
        category,
        transactionDate: date,
        description: trimmedDescription,
        method,
        roomId: roomId === NONE ? null : roomId,
        tenantId: type === 'income' && tenantId !== NONE ? tenantId : null,
        receiptPath: clearReceipt ? null : transaction?.receipt_path ?? null,
        receipt: file,
      },
      {
        onSuccess: () => {
          toast.success(transaction ? 'Transaction updated' : 'Transaction added')
          onOpenChange(false)
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    )
  }

  function createCategory() {
    const name = newCategory.trim()
    if (!name) {
      toast.error('Enter a category name.')
      return
    }
    addCategory.mutate(
      { type, name },
      {
        onSuccess: () => {
          setCategory(name)
          setNewCategory('')
          setAddCategoryOpen(false)
          toast.success('Category added')
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    )
  }

  return (
    <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {type === 'income'
              ? 'Record income not already captured from a verified bill payment.'
              : 'Track a property operating cost. Expenses stay separate from tenant bills.'}
          </DialogDescription>
          {optionError && <p role="alert" className="text-sm text-destructive">{getErrorMessage(optionError)}</p>}
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit} noValidate>
          {Object.keys(validation).length > 0 && <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-semibold">Check the required fields</p><ul className="mt-1 list-inside list-disc">{Object.entries(validation).map(([field, message]) => <li key={field}>{message}</li>)}</ul></div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="finance-amount">Amount</Label>
              <Input
                id="finance-amount"
                aria-invalid={!!validation.amount}
                aria-describedby={validation.amount ? 'finance-amount-error' : undefined}
                type="number"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                className="tabular"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
              {validation.amount && <p id="finance-amount-error" className="text-xs text-destructive">{validation.amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance-date">Date</Label>
              <Input
                id="finance-date"
                aria-invalid={!!validation.date}
                aria-describedby={validation.date ? 'finance-date-error' : undefined}
                type="date"
                max={todayISO()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
              {validation.date && <p id="finance-date-error" className="text-xs text-destructive">{validation.date}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="flex gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Category" aria-invalid={!!validation.category} aria-describedby={validation.category ? 'finance-category-error' : undefined} className="w-full">
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" aria-label="Add a custom category" onClick={() => setAddCategoryOpen((value) => !value)}>
                {addCategoryOpen ? <X /> : <Plus />}
              </Button>
            </div>
            {validation.category && <p id="finance-category-error" className="text-xs text-destructive">{validation.category}</p>}
            {addCategoryOpen && (
              <div className="flex gap-2">
                <Input
                  aria-label="New category name"
                  maxLength={60}
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="New category name"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      createCategory()
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={createCategory} disabled={addCategory.isPending}>Save</Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance-description">Description</Label>
            <Textarea
              id="finance-description"
              aria-invalid={!!validation.description}
              aria-describedby={validation.description ? 'finance-description-error' : undefined}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              placeholder={type === 'income' ? 'What was this income for?' : 'Add a note about this expense'}
              required
            />
            {validation.description && <p id="finance-description-error" className="text-xs text-destructive">{validation.description}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as Enums<'payment_method'>)}>
                <SelectTrigger aria-label="Payment method" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Room / property</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger aria-label="Room or property" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Entire property</SelectItem>
                  {(rooms.data ?? []).map((room) => (
                    <SelectItem key={room.id} value={room.id}>Room {room.room_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {type === 'income' && (
            <div className="space-y-2">
              <Label>Tenant <span className="font-normal text-muted-foreground">· optional</span></Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger aria-label="Tenant" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No tenant selected</SelectItem>
                  {(tenants.data ?? []).map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.full_name}{tenant.room_number ? ` · Room ${tenant.room_number}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === 'expense' && (
            <div className="space-y-2">
              <Label htmlFor="finance-receipt">Receipt <span className="font-normal text-muted-foreground">· optional</span></Label>
              {transaction?.receipt_path && !clearReceipt && !file && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  <a href={receiptUrl.data} target="_blank" rel="noreferrer" className="min-w-0 truncate text-primary underline-offset-4 hover:underline">
                    View current receipt
                  </a>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setClearReceipt(true)}>Remove</Button>
                </div>
              )}
              {receiptUrl.error && <p role="alert" className="text-sm text-destructive">{getErrorMessage(receiptUrl.error)}</p>}
              {file ? (
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove selected receipt" onClick={() => setFile(null)}><X /></Button>
                </div>
              ) : (
                <label
                  htmlFor="finance-receipt"
                  className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:bg-muted/40"
                >
                  <Upload className="size-4" /> Choose JPG, PNG, WebP, or PDF (max 5 MB)
                  <input
                    id="finance-receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              )}
              {clearReceipt && <Button type="button" variant="ghost" size="sm" onClick={() => setClearReceipt(false)}>Keep current receipt</Button>}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={save.isPending}>Cancel</Button></DialogClose>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : transaction ? 'Save changes' : 'Add transaction'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
  )
}
