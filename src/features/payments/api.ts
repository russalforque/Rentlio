import { useMutation, useQuery } from '@tanstack/react-query'
import { useInvalidateBilling } from '@/features/billing/api'
import type { Enums, Views } from '@/lib/database.types'
import { STORAGE_BUCKETS, supabase } from '@/lib/supabase'

export type PaymentOverview = Views<'payment_overview'>

export const paymentKeys = {
  all: ['payments'] as const,
  pending: () => [...paymentKeys.all, 'pending'] as const,
  history: (period: string) => [...paymentKeys.all, 'history', period] as const,
  forBill: (billId: string) => [...paymentKeys.all, 'bill', billId] as const,
  mine: () => [...paymentKeys.all, 'mine'] as const,
  proof: (path: string) => [...paymentKeys.all, 'proof', path] as const,
}

export const METHOD_LABEL: Record<Enums<'payment_method'>, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  gcash: 'GCash',
  maya: 'Maya',
  check: 'Check',
  other: 'Other',
}

// Queries --------------------------------------------------------------------------

/** Oldest first: the landlord works through the queue in order. */
export function usePendingPayments() {
  return useQuery({
    queryKey: paymentKeys.pending(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_overview')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    refetchInterval: 60_000,
  })
}

/** Reviewed payments whose payment date falls in the given month. */
export function usePaymentHistory(period: string, nextPeriod: string) {
  return useQuery({
    queryKey: paymentKeys.history(period),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_overview')
        .select('*')
        .neq('status', 'pending')
        .gte('paid_on', period)
        .lt('paid_on', nextPeriod)
        .order('paid_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useBillPayments(billId: string) {
  return useQuery({
    queryKey: paymentKeys.forBill(billId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_overview')
        .select('*')
        .eq('bill_id', billId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** For tenants: RLS limits this to their own payments. */
export function useMyPayments() {
  return useQuery({
    queryKey: paymentKeys.mine(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_overview')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Short-lived signed URL for a private proof file. */
export function useProofUrl(path: string | null) {
  return useQuery({
    queryKey: paymentKeys.proof(path ?? ''),
    enabled: !!path,
    staleTime: 8 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.paymentProofs)
        .createSignedUrl(path as string, 10 * 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}

// Uploads ---------------------------------------------------------------------------

export const PROOF_MAX_BYTES = 5 * 1024 * 1024
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

export function validateProof(file: File): string | null {
  if (!PROOF_TYPES.includes(file.type)) return 'Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.'
  if (file.size > PROOF_MAX_BYTES) return 'The file is larger than 5 MB. Try a screenshot or a smaller photo.'
  return null
}

/** Stores a proof under "<tenant_id>/<random>.<ext>"; storage policies enforce the folder. */
export async function uploadProof(tenantId: string, file: File): Promise<string> {
  const problem = validateProof(file)
  if (problem) throw new Error(problem)
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.paymentProofs)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}

// Mutations -----------------------------------------------------------------------

async function call<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export function useReviewPayment() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (a: { paymentId: string; approve: boolean; amount?: number | null; reason?: string | null }) =>
      call(
        supabase.rpc('review_payment', {
          p_payment_id: a.paymentId,
          p_approve: a.approve,
          p_amount: a.amount ?? null,
          p_reason: a.reason ?? null,
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useRecordPayment() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: async (a: {
      billId: string
      tenantId: string
      amount: number
      method: Enums<'payment_method'>
      paidOn: string
      reference: string | null
      notes: string | null
      receipt: File | null
    }) => {
      const proofPath = a.receipt ? await uploadProof(a.tenantId, a.receipt) : null
      return call(
        supabase.rpc('record_payment', {
          p_bill_id: a.billId,
          p_amount: a.amount,
          p_method: a.method,
          p_paid_on: a.paidOn,
          p_reference_number: a.reference,
          p_notes: a.notes,
          p_proof_path: proofPath,
        }),
      )
    },
    onSuccess: invalidate,
  })
}

export function useSubmitPayment() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: async (a: {
      billId: string
      tenantId: string
      amount: number
      method: Enums<'payment_method'>
      paidOn: string
      reference: string | null
      notes: string | null
      proof: File
    }) => {
      const proofPath = await uploadProof(a.tenantId, a.proof)
      return call(
        supabase.rpc('submit_payment', {
          p_bill_id: a.billId,
          p_amount: a.amount,
          p_method: a.method,
          p_paid_on: a.paidOn,
          p_proof_path: proofPath,
          p_reference_number: a.reference,
          p_notes: a.notes,
        }),
      )
    },
    onSuccess: invalidate,
  })
}
