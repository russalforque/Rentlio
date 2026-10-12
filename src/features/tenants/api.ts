import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { roomKeys } from '@/features/rooms/api'
import type { Enums, TablesUpdate, Views } from '@/lib/database.types'
import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

export type TenantOverview = Views<'tenant_overview'>

export const tenantKeys = {
  all: ['tenants'] as const,
  list: () => [...tenantKeys.all, 'list'] as const,
  detail: (id: string) => [...tenantKeys.all, 'detail', id] as const,
  leases: (id: string) => [...tenantKeys.all, 'leases', id] as const,
  deposits: (id: string) => [...tenantKeys.all, 'deposits', id] as const,
}

// Queries --------------------------------------------------------------------------

export function useTenants() {
  return useQuery({
    queryKey: tenantKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from('tenant_overview').select('*').order('full_name')
      if (error) throw error
      return data
    },
  })
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: tenantKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('tenant_overview').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useTenantLeases(tenantId: string) {
  return useQuery({
    queryKey: tenantKeys.leases(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leases')
        .select('*, rooms(room_number)')
        .eq('tenant_id', tenantId)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useDepositLedger(tenantId: string) {
  return useQuery({
    queryKey: tenantKeys.deposits(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_transactions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Rooms a tenant can be assigned to right now. */
export function useVacantRooms() {
  return useQuery({
    queryKey: [...roomKeys.all, 'vacant'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_overview')
        .select('id, room_number, floor, monthly_rent')
        .eq('occupancy', 'vacant')
      if (error) throw error
      return data.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
    },
  })
}

// Mutations -----------------------------------------------------------------------

/** Tenant and room data overlap (occupancy, balances), so refresh both. */
function useInvalidateTenancy() {
  const qc = useQueryClient()
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: tenantKeys.all }), qc.invalidateQueries({ queryKey: roomKeys.all })])
}

async function throwing<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export interface InviteTenantInput {
  email: string
  full_name: string
  phone: string | null
  assignment: {
    room_id: string
    start_date: string
    monthly_rent: number | null
    deposit_amount: number | null
  } | null
}

export interface InviteTenantResult {
  tenant_id: string
  lease_id: string | null
  assignment_error: string | null
}

export function useInviteTenant() {
  const invalidate = useInvalidateTenancy()
  return useMutation({
    mutationFn: (input: InviteTenantInput) =>
      invokeFunction<InviteTenantResult>('invite-tenant', { ...input }),
    onSuccess: invalidate,
  })
}

export function useManageTenant() {
  const invalidate = useInvalidateTenancy()
  return useMutation({
    mutationFn: ({ action, tenantId }: { action: 'resend_invite' | 'deactivate' | 'reactivate'; tenantId: string }) =>
      invokeFunction<{ ok: true }>('manage-tenant', { action, tenant_id: tenantId }),
    onSuccess: invalidate,
  })
}

export function useUpdateTenantProfile() {
  const invalidate = useInvalidateTenancy()
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: TablesUpdate<'profiles'> }) =>
      throwing(supabase.from('profiles').update(values).eq('id', id)),
    onSuccess: invalidate,
  })
}

export function useAssignTenant() {
  const invalidate = useInvalidateTenancy()
  return useMutation({
    mutationFn: (args: {
      tenantId: string
      roomId: string
      startDate: string
      monthlyRent: number | null
      depositAmount: number | null
    }) =>
      throwing(
        supabase.rpc('assign_tenant', {
          p_tenant_id: args.tenantId,
          p_room_id: args.roomId,
          p_start_date: args.startDate,
          p_monthly_rent: args.monthlyRent,
          p_deposit_amount: args.depositAmount,
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useMoveTenant() {
  const invalidate = useInvalidateTenancy()
  return useMutation({
    mutationFn: (args: { leaseId: string; roomId: string; moveDate: string; monthlyRent: number | null }) =>
      throwing(
        supabase.rpc('move_tenant', {
          p_lease_id: args.leaseId,
          p_room_id: args.roomId,
          p_move_date: args.moveDate,
          p_monthly_rent: args.monthlyRent,
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useEndLease() {
  const invalidate = useInvalidateTenancy()
  return useMutation({
    mutationFn: ({ leaseId, endDate }: { leaseId: string; endDate: string }) =>
      throwing(supabase.rpc('end_lease', { p_lease_id: leaseId, p_end_date: endDate })),
    onSuccess: invalidate,
  })
}

export function useUpdateLeaseRent() {
  const invalidate = useInvalidateTenancy()
  return useMutation({
    mutationFn: ({ leaseId, rent }: { leaseId: string; rent: number }) =>
      throwing(supabase.rpc('update_lease_rent', { p_lease_id: leaseId, p_monthly_rent: rent })),
    onSuccess: invalidate,
  })
}

export function useRecordDeposit() {
  const invalidate = useInvalidateTenancy()
  return useMutation({
    mutationFn: (args: {
      leaseId: string
      type: Enums<'deposit_txn_type'>
      amount: number
      date: string
      notes: string | null
    }) =>
      throwing(
        supabase.rpc('record_deposit_transaction', {
          p_lease_id: args.leaseId,
          p_type: args.type,
          p_amount: args.amount,
          p_date: args.date,
          p_notes: args.notes,
        }),
      ),
    onSuccess: invalidate,
  })
}
