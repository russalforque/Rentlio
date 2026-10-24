import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { roomKeys } from '@/features/rooms/api'
import { tenantKeys } from '@/features/tenants/api'
import type { Database, Views } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type BillOverview = Views<'bill_overview'>
export type ReadingSheetRow = Database['public']['Functions']['meter_reading_sheet']['Returns'][number]

export const billingKeys = {
  all: ['billing'] as const,
  bills: (period: string) => [...billingKeys.all, 'bills', period] as const,
  bill: (id: string) => [...billingKeys.all, 'bill', id] as const,
  items: (id: string) => [...billingKeys.all, 'items', id] as const,
  sheet: (period: string) => [...billingKeys.all, 'sheet', period] as const,
  runs: () => [...billingKeys.all, 'runs'] as const,
  waterRates: () => [...billingKeys.all, 'water-rates'] as const,
  dueDateAudit: (id: string) => [...billingKeys.all, 'due-date-audit', id] as const,
}

const byRoom = <T extends { room_number: string }>(a: T, b: T) =>
  a.room_number.localeCompare(b.room_number, undefined, { numeric: true })

// Queries --------------------------------------------------------------------------

export function useBills(period: string) {
  return useQuery({
    queryKey: billingKeys.bills(period),
    queryFn: async () => {
      const { data, error } = await supabase.from('bill_overview').select('*').eq('period', period)
      if (error) throw error
      return data.sort(byRoom)
    },
  })
}

export function useBill(id: string) {
  return useQuery({
    queryKey: billingKeys.bill(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('bill_overview').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useBillItems(billId: string) {
  return useQuery({
    queryKey: billingKeys.items(billId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bill_items')
        .select('*')
        .eq('bill_id', billId)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useReadingSheet(period: string, editing = false) {
  return useQuery({
    queryKey: billingKeys.sheet(period),
    // Refocusing a phone after checking a meter photo must not replace an unsaved grid.
    refetchOnWindowFocus: !editing,
    refetchOnReconnect: !editing,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meter_reading_sheet', { p_period: period })
      if (error) throw error
      return data.sort(byRoom)
    },
  })
}

export function useBillingRuns() {
  return useQuery({
    queryKey: billingKeys.runs(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })
}

export function useWaterRateSchedule() {
  return useQuery({
    queryKey: billingKeys.waterRates(),
    queryFn: async () => {
      const { data, error } = await supabase.from('water_rate_schedule').select('*').order('effective_from', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useBillDueDateAudit(billId: string) {
  return useQuery({
    queryKey: billingKeys.dueDateAudit(billId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bill_due_date_audit')
        .select('*')
        .eq('bill_id', billId)
        .order('changed_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// Mutations -----------------------------------------------------------------------

/** Bills feed balances shown on rooms, tenants and the dashboard. */
export function useInvalidateBilling() {
  const qc = useQueryClient()
  return useCallback(() =>
    Promise.all([
      qc.invalidateQueries({ queryKey: billingKeys.all }),
      qc.invalidateQueries({ queryKey: tenantKeys.all }),
      qc.invalidateQueries({ queryKey: roomKeys.all }),
      qc.invalidateQueries({ queryKey: ['payments'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      qc.invalidateQueries({ queryKey: ['finances'] }),
    ]), [qc])
}

async function call<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export function useGenerateBills() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (period: string) => call(supabase.rpc('generate_bills', { p_period: period })),
    onSuccess: invalidate,
  })
}

export function useSetWaterRate() {
  const invalidate = useInvalidateBilling()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { monthlyRate: number; effectiveFrom: string }) =>
      call(supabase.rpc('set_water_rate', { p_monthly_rate: args.monthlyRate, p_effective_from: args.effectiveFrom })),
    onSuccess: async () => {
      await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: billingKeys.waterRates() })])
    },
  })
}

export function useOverrideBillDueDate() {
  const invalidate = useInvalidateBilling()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { billId: string; dueDate: string; reason: string }) =>
      call(supabase.rpc('override_bill_due_date', {
        p_bill_id: args.billId,
        p_due_date: args.dueDate,
        p_reason: args.reason,
      })),
    onSuccess: async (_data, args) => {
      await Promise.all([
        invalidate(),
        qc.invalidateQueries({ queryKey: billingKeys.dueDateAudit(args.billId) }),
      ])
    },
  })
}

export type ReadingInput = {
  room_id: string
  water_previous?: number | null
  water_current?: number | null
  aircon_previous?: number | null
  aircon_current?: number | null
  aircon_reset?: boolean
  aircon_event?: 'normal' | 'review' | 'reset' | 'replacement' | 'rollover'
  aircon_rollover_at?: number | null
  outlet_previous?: number | null
  outlet_current?: number | null
  outlet_reset?: boolean
  outlet_event?: 'normal' | 'review' | 'reset' | 'replacement' | 'rollover'
  outlet_rollover_at?: number | null
  light_previous?: number | null
  light_current?: number | null
  light_reset?: boolean
  light_event?: 'normal' | 'review' | 'reset' | 'replacement' | 'rollover'
  light_rollover_at?: number | null
}

export function useRecordReadings() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: ({ period, readings }: { period: string; readings: ReadingInput[] }) =>
      call(supabase.rpc('record_room_readings', { p_period: period, p_readings: readings })),
    onSuccess: invalidate,
  })
}

export function useAddCharge() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (a: { billId: string; description: string; amount: number }) =>
      call(supabase.rpc('add_bill_charge', { p_bill_id: a.billId, p_description: a.description, p_amount: a.amount })),
    onSuccess: invalidate,
  })
}

export function useUpdateBillItem() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (a: { itemId: string; description: string | null; amount: number }) =>
      call(supabase.rpc('update_bill_item', { p_item_id: a.itemId, p_description: a.description, p_amount: a.amount })),
    onSuccess: invalidate,
  })
}

export function useRemoveCharge() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (itemId: string) => call(supabase.rpc('remove_bill_charge', { p_item_id: itemId })),
    onSuccess: invalidate,
  })
}

/** Sends a draft to the tenant. skipMissing finalizes even without an electricity or water charge. */
export function useFinalizeBill() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (a: { billId: string; skipMissing?: boolean }) =>
      call(supabase.rpc('finalize_bill', { p_bill_id: a.billId, p_skip_missing: a.skipMissing ?? false })),
    onSuccess: invalidate,
  })
}

/** Finalizes every complete draft for the month; resolves to how many were sent. */
export function useFinalizeBills() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (period: string) => call(supabase.rpc('finalize_bills', { p_period: period })),
    onSuccess: invalidate,
  })
}

export function useReopenBill() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (billId: string) => call(supabase.rpc('reopen_bill', { p_bill_id: billId })),
    onSuccess: invalidate,
  })
}

export const CHARGE_LABEL: Record<string, string> = { rent: 'Rent', electricity: 'Electricity', water: 'Water' }

export function useVoidBill() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (a: { billId: string; reason: string }) =>
      call(supabase.rpc('void_bill', { p_bill_id: a.billId, p_reason: a.reason })),
    onSuccess: invalidate,
  })
}
