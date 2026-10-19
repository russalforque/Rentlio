// Tenant-facing queries. Row Level Security limits every one of these to the
// signed-in tenant's own records, so no tenant_id filter is needed for safety;
// filters below exist only to shape the results.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/pagination'

export const portalKeys = {
  tenancy: ['portal', 'tenancy'] as const,
  bills: ['billing', 'mine'] as const,
  deposit: ['tenants', 'my-deposit'] as const,
}

export function useMyTenancy() {
  return useQuery({
    queryKey: portalKeys.tenancy,
    queryFn: async () => {
      const data = await fetchAllRows((from, to) => supabase
        .from('leases')
        .select('*, rooms(room_number, floor, description, capacity)', { count: 'exact' })
        .order('start_date', { ascending: false })
        .order('id')
        .range(from, to))
      return { current: data.find((l) => l.status === 'active') ?? null, history: data }
    },
  })
}

export function useMyBills() {
  return useQuery({
    queryKey: portalKeys.bills,
    queryFn: () => fetchAllRows((from, to) => supabase
        .from('bill_overview')
        .select('*', { count: 'exact' })
        .neq('status', 'void')
        .order('period', { ascending: false })
        .order('id')
        .range(from, to)),
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
