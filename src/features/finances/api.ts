import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables, Views } from '@/lib/database.types'
import { STORAGE_BUCKETS, supabase } from '@/lib/supabase'
import {
  calculateDailyCashReport,
  type CashReportTransaction,
} from './daily-cash-report-model'

export type FinanceTransaction = Views<'financial_transaction_overview'>
export type FinanceCategory = Tables<'financial_categories'>
export type TransactionType = 'income' | 'expense'

export const INCOME_CATEGORIES = ['Rental Income', 'Utility Payments', 'Other Income']
export const EXPENSE_CATEGORIES = [
  'Maintenance',
  'Repairs',
  'Electricity',
  'Water',
  'Internet',
  'Cleaning',
  'Supplies',
  'Salaries',
  'Taxes',
  'Other',
]

export const financeKeys = {
  all: ['finances'] as const,
  transactions: () => [...financeKeys.all, 'transactions'] as const,
  dailyCashReport: (date: string) => [...financeKeys.all, 'daily-cash-report', date] as const,
  categories: () => [...financeKeys.all, 'categories'] as const,
  receipt: (path: string) => [...financeKeys.all, 'receipt', path] as const,
}

export function useFinanceTransactions() {
  return useQuery({
    queryKey: financeKeys.transactions(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_transaction_overview')
        .select('*')
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useDailyCashReport(date: string, enabled: boolean) {
  return useQuery({
    queryKey: financeKeys.dailyCashReport(date),
    enabled,
    queryFn: async () => {
      const transactions: CashReportTransaction[] = []
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('financial_transaction_overview')
          .select('id, amount, category, description, payment_id, room_number, source, tenant_name, transaction_date, transaction_type, method')
          .eq('method', 'cash')
          .lte('transaction_date', date)
          .order('transaction_date')
          .order('id')
          .range(offset, offset + pageSize - 1)
        if (error) throw error
        transactions.push(...data)
        if (data.length < pageSize) break
      }

      const adjustments: { adjustment_date: string; amount_delta: number }[] = []
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('daily_cash_adjustments')
          .select('adjustment_date, amount_delta')
          .lte('adjustment_date', date)
          .order('adjustment_date')
          .order('id')
          .range(offset, offset + pageSize - 1)
        if (error) throw error
        adjustments.push(...data)
        if (data.length < pageSize) break
      }

      const [openingForDate, previousOpening] = await Promise.all([
        supabase
          .from('daily_cash_openings')
          .select('opening_date, opening_cash, updated_at, updated_by')
          .eq('opening_date', date)
          .maybeSingle(),
        supabase
          .from('daily_cash_openings')
          .select('opening_date, opening_cash, updated_at, updated_by')
          .lt('opening_date', date)
          .order('opening_date', { ascending: false })
          .limit(1),
      ])
      if (openingForDate.error) throw openingForDate.error
      if (previousOpening.error) throw previousOpening.error
      const openings = [openingForDate.data, ...(previousOpening.data[0] ? [previousOpening.data[0]] : [])]
      return calculateDailyCashReport(
        date,
        transactions,
        adjustments,
        openings.filter((opening) => opening !== null),
      )
    },
  })
}

export function useSaveDailyCashOpening() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { date: string; amount: number }) => {
      const { data, error } = await supabase.rpc('save_daily_cash_opening', {
        p_opening_date: input.date,
        p_opening_cash: input.amount,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  })
}

export function useRecordDailyCashAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { date: string; amountDelta: number; reason: string }) => {
      const { data, error } = await supabase.rpc('record_daily_cash_adjustment', {
        p_adjustment_date: input.date,
        p_amount_delta: input.amountDelta,
        p_reason: input.reason,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  })
}

export function useFinanceCategories(type: TransactionType) {
  return useQuery({
    queryKey: [...financeKeys.categories(), type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_categories')
        .select('*')
        .eq('transaction_type', type)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useFinanceReceiptUrl(path: string | null) {
  return useQuery({
    queryKey: financeKeys.receipt(path ?? ''),
    enabled: !!path,
    staleTime: 8 * 60_000,
    queryFn: async () => {
      if (!path) throw new Error('A receipt path is required')
      const { data, error } = await supabase.storage.from(STORAGE_BUCKETS.financialReceipts).createSignedUrl(path, 10 * 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function validateFinancialReceipt(file: File): string | null {
  if (!RECEIPT_TYPES.includes(file.type)) return 'Upload a JPG, PNG, WebP, or PDF receipt.'
  if (file.size > RECEIPT_MAX_BYTES) return 'The receipt must be 5 MB or smaller.'
  return null
}

async function uploadReceipt(file: File): Promise<string> {
  const issue = validateFinancialReceipt(file)
  if (issue) throw new Error(issue)
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type.slice('image/'.length).replace('jpeg', 'jpg')
  const { data: profileId, error: profileError } = await supabase.rpc('current_profile_id')
  if (profileError) throw profileError
  if (!profileId) throw new Error('Sign in again before uploading a receipt.')
  const path = `${profileId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.financialReceipts)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(`Receipt upload failed: ${error.message}`)
  return path
}

export interface SaveFinanceTransaction {
  id?: string
  transactionType: TransactionType
  amount: number
  category: string
  transactionDate: string
  description: string
  method: Enums<'payment_method'>
  roomId: string | null
  tenantId: string | null
  receiptPath: string | null
  receipt: File | null
}

export function useSaveFinanceTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveFinanceTransaction) => {
      const receiptPath = input.transactionType === 'expense'
        ? input.receipt ? await uploadReceipt(input.receipt) : input.receiptPath
        : null
      const { data, error } = await supabase.rpc('save_financial_transaction', {
        p_id: input.id,
        p_transaction_type: input.transactionType,
        p_amount: input.amount,
        p_category: input.category,
        p_transaction_date: input.transactionDate,
        p_description: input.description,
        p_method: input.method,
        p_room_id: input.roomId ?? undefined,
        p_tenant_id: input.tenantId ?? undefined,
        p_receipt_path: receiptPath ?? undefined,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  })
}

export function useDeleteFinanceTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_financial_transaction', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  })
}

export function useAddFinanceCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ type, name }: { type: TransactionType; name: string }) => {
      const { data, error } = await supabase.rpc('add_financial_category', {
        p_transaction_type: type,
        p_name: name,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.categories() }),
  })
}
