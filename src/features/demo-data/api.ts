import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DemoFunctions } from './types'
import { demoBatchSchema, demoDeletionSchema, demoSnapshotSchema } from './types'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/errors'

export function demoErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Check the demo form values'
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42501'
    && 'message' in error && typeof error.message === 'string'
    && /^(Demo isolation|An unreviewed scheduled job|Cannot verify the complete scheduler)/.test(error.message)) return error.message
  return getErrorMessage(error)
}

export const demoKeys = { all: ['demo-data'] as const, batch: (id: string | null) => ['demo-data', 'batch', id] as const }

export function useDemoBatches() {
  return useQuery({
    queryKey: [...demoKeys.all, 'list'], retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('demo_list_batches')
      if (error) throw error
      return z.array(demoBatchSchema).parse(data)
    },
  })
}

export async function fetchDemoBatch(id: string) {
  const { data, error } = await supabase.rpc('demo_get_batch', { p_batch_id: id })
  if (error) throw error
  return demoSnapshotSchema.parse(data)
}

export function useDemoBatch(id: string | null) {
  return useQuery({ queryKey: demoKeys.batch(id), enabled: id !== null, retry: false, queryFn: () => fetchDemoBatch(id!) })
}

// These hooks have no connection to production billing/payment invalidation,
// storage uploads, notifications, Edge Functions or provider clients.
export function useGenerateDemo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc('demo_generate_batch', { p_request_id: requestId })
      if (error) throw error
      return z.string().uuid().parse(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demoKeys.all }),
  })
}

type WritableRPC = 'demo_record_payment' | 'demo_review_payment' | 'demo_save_cash_opening' | 'demo_record_expense'
export function useDemoWrite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { [K in WritableRPC]: { name: K; args: DemoFunctions[K]['Args'] } }[WritableRPC]) => {
      // Discriminated branches retain each RPC's checked argument signature.
      const response = input.name === 'demo_record_payment' ? await supabase.rpc(input.name, input.args)
        : input.name === 'demo_review_payment' ? await supabase.rpc(input.name, input.args)
          : input.name === 'demo_save_cash_opening' ? await supabase.rpc(input.name, input.args)
            : await supabase.rpc(input.name, input.args)
      if (response.error) throw response.error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demoKeys.all }),
  })
}

export function useDeleteDemo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; revision: number }) => {
      const { data, error } = await supabase.rpc('demo_delete_batch', { p_batch_id: input.id, p_expected_revision: input.revision })
      if (error) throw error
      return demoDeletionSchema.parse(data)
    },
    onSuccess: (_, input) => {
      qc.removeQueries({ queryKey: demoKeys.batch(input.id) })
      return qc.invalidateQueries({ queryKey: demoKeys.all })
    },
  })
}
