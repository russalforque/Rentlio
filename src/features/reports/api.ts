import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const reportKeys = {
  billsSince: (from: string) => ['billing', 'since', from] as const,
  open: ['billing', 'open'] as const,
  recentPayments: ['payments', 'recent-verified'] as const,
}

/** Non-void bills from a period onwards (at most 28 rooms x 12 months). */
export function useBillsSince(fromPeriod: string) {
  return useQuery({
    queryKey: reportKeys.billsSince(fromPeriod),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bill_overview')
        .select(
          'id, period, lease_id, tenant_id, total_amount, amount_paid, balance, status, is_overdue, is_finalized, rent_amount, electricity_amount, water_amount, other_amount, rent_paid, electricity_paid, water_paid, other_paid',
        )
        .gte('period', fromPeriod)
        .neq('status', 'void')
      if (error) throw error
      return data
    },
  })
}

/** Every issued bill with money still owed, across all months. Drafts are not owed yet. */
export function useOpenBills() {
  return useQuery({
    queryKey: reportKeys.open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bill_overview')
        .select('id, period, due_date, tenant_id, tenant_name, room_number, balance, is_overdue, status')
        .in('status', ['unpaid', 'partial'])
        .eq('is_finalized', true)
        .order('due_date')
      if (error) throw error
      return data
    },
  })
}

export function useRecentVerifiedPayments(limit = 6) {
  return useQuery({
    queryKey: [...reportKeys.recentPayments, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_overview')
        .select('id, amount, method, paid_on, tenant_name, room_number, reviewed_at')
        .eq('status', 'verified')
        .order('reviewed_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
  })
}

/** One row of useOpenBills(). */
export type OpenBill = NonNullable<ReturnType<typeof useOpenBills>['data']>[number]
