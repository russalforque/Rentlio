// Tenant-facing queries. Row Level Security limits every one of these to the
// signed-in tenant's own records, so no tenant_id filter is needed for safety;
// filters below exist only to shape the results.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const portalKeys = {
  tenancy: ['portal', 'tenancy'] as const,
  bills: ['billing', 'mine'] as const,
  deposit: ['tenants', 'my-deposit'] as const,
}

export function useMyTenancy() {
  return useQuery({
    queryKey: portalKeys.tenancy,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leases')
        .select('*, rooms(room_number, floor, description, capacity)')
        .order('start_date', { ascending: false })
      if (error) throw error
      return { current: data.find((l) => l.status === 'active') ?? null, history: data }
    },
  })
}

export function useMyBills() {
  return useQuery({
    queryKey: portalKeys.bills,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bill_overview')
        .select('*')
        .neq('status', 'void')
        .order('period', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useMyDepositBalance() {
  return useQuery({
    queryKey: portalKeys.deposit,
    queryFn: async () => {
      const { data, error } = await supabase.from('deposit_balances').select('*').maybeSingle()
      if (error) throw error
      return data?.balance ?? 0
    },
  })
}
