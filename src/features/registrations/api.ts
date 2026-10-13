import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tenantKeys } from '@/features/tenants/api'
import type { Enums, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type RegistrationRequest = Tables<'registration_requests'>
export type AuditEntry = Tables<'account_audit_log'>

export const registrationKeys = {
  all: ['registrations'] as const,
  list: () => [...registrationKeys.all, 'list'] as const,
  pendingCount: () => [...registrationKeys.all, 'pending-count'] as const,
  history: (requestId: string) => [...registrationKeys.all, 'history', requestId] as const,
}

/** Self-registrations, newest first. Invitation logins are history only, so they are listed too. */
export function useRegistrations() {
  return useQuery({
    queryKey: registrationKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registration_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data
    },
  })
}

export function usePendingRegistrationCount() {
  return useQuery({
    queryKey: registrationKeys.pendingCount(),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('registration_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useRegistrationHistory(requestId: string) {
  return useQuery({
    queryKey: registrationKeys.history(requestId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_audit_log')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

function useInvalidateAccounts() {
  const qc = useQueryClient()
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: registrationKeys.all }), qc.invalidateQueries({ queryKey: tenantKeys.all })])
}

export function useApproveRegistration() {
  const invalidate = useInvalidateAccounts()
  return useMutation({
    mutationFn: async (args: {
      requestId: string
      tenantId: string | null
      identityCheck: Exclude<Enums<'identity_check'>, 'invitation'>
      note: string
    }) => {
      const { data, error } = await supabase.rpc('approve_registration', {
        p_request_id: args.requestId,
        p_tenant_id: args.tenantId,
        p_identity_check: args.identityCheck,
        p_note: args.note,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useRejectRegistration() {
  const invalidate = useInvalidateAccounts()
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_registration', { p_request_id: requestId, p_reason: reason })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
