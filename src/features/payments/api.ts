import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useInvalidateBilling } from '@/features/billing/api'
import type { Enums, Tables, Views } from '@/lib/database.types'
import { invokeFunction } from '@/lib/functions'
import { STORAGE_BUCKETS, supabase } from '@/lib/supabase'

export type PaymentOverview = Views<'payment_overview'>
export type PaymentAccount = Tables<'landlord_payment_accounts'>

export const paymentKeys = {
  all: ['payments'] as const,
  accounts: () => [...paymentKeys.all, 'accounts'] as const,
  accountQr: (path: string) => [...paymentKeys.all, 'account-qr', path] as const,
  pending: () => [...paymentKeys.all, 'pending'] as const,
  history: (period: string) => [...paymentKeys.all, 'history', period] as const,
  forBill: (billId: string) => [...paymentKeys.all, 'bill', billId] as const,
  allocations: (billId: string) => [...paymentKeys.all, 'allocations', billId] as const,
  receipt: (paymentId: string) => [...paymentKeys.all, 'receipt', paymentId] as const,
  mine: () => [...paymentKeys.all, 'mine'] as const,
  proof: (path: string) => [...paymentKeys.all, 'proof', path] as const,
}

export const METHOD_LABEL: Record<Enums<'payment_method'>, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  gcash: 'GCash',
  maya: 'Maya',
  check: 'Check',
  card: 'Card',
  other: 'Other',
}

/** Methods the landlord can record by hand; card payments only arrive through the online checkout. */
export const MANUAL_METHODS = (Object.entries(METHOD_LABEL) as [Enums<'payment_method'>, string][]).filter(
  ([m]) => m !== 'card',
)

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

/** RLS exposes every account to the landlord and active accounts to current tenants only. */
export function usePaymentAccounts() {
  return useQuery({
    queryKey: paymentKeys.accounts(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landlord_payment_accounts')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/** Short-lived signed URL for a private landlord QR image. */
export function usePaymentQrUrl(path: string | null) {
  return useQuery({
    queryKey: paymentKeys.accountQr(path ?? ''),
    enabled: !!path,
    staleTime: 8 * 60_000,
    queryFn: async () => {
      if (!path) throw new Error('A QR image path is required')
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.paymentQrCodes)
        .createSignedUrl(path, 10 * 60)
      if (error) throw error
      return data.signedUrl
    },
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

/** How much of each charge on a bill has been paid, keyed by bill item id. */
export function useBillAllocations(billId: string) {
  return useQuery({
    queryKey: paymentKeys.allocations(billId),
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_allocations').select('bill_item_id, amount').eq('bill_id', billId)
      if (error) throw error
      const paid = new Map<string, number>()
      for (const a of data) paid.set(a.bill_item_id, (paid.get(a.bill_item_id) ?? 0) + a.amount)
      return paid
    },
  })
}

/** The receipt for one verified payment, or null if it does not exist or is not the caller's. */
export function usePaymentReceipt(paymentId: string) {
  return useQuery({
    queryKey: paymentKeys.receipt(paymentId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('payment_receipt', { p_payment_id: paymentId })
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
export const QR_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
export const QR_MAX_BYTES = 4 * 1024 * 1024

export function validateQrImage(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use a JPG, PNG, or WebP QR image.'
  if (file.size > QR_MAX_BYTES) return 'QR images must be 4 MB or smaller.'
  return null
}

export function validateQrProof(file: File): string | null {
  if (!QR_PROOF_TYPES.includes(file.type)) return 'Upload a JPG, PNG, WebP, or HEIC payment screenshot.'
  if (file.size > PROOF_MAX_BYTES) return 'The screenshot is larger than 5 MB.'
  return null
}

export async function uploadPaymentQr(landlordId: string, file: File): Promise<string> {
  const problem = validateQrImage(file)
  if (problem) throw new Error(problem)
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const path = `${landlordId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.paymentQrCodes)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(`QR upload failed: ${error.message}`)
  return path
}

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
    mutationFn: (a: {
      paymentId: string
      approve: boolean
      amount?: number | null
      reason?: string | null
      moneyReceived: boolean
    }) =>
      call(
        supabase.rpc('review_payment_confirmed', {
          p_payment_id: a.paymentId,
          p_approve: a.approve,
          p_amount: a.amount ?? undefined,
          p_reason: a.reason ?? undefined,
          p_money_received: a.moneyReceived,
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
      /** One per form: a retried submit returns the payment already recorded. */
      requestId: string
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
          p_request_id: a.requestId,
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
      requestId: string
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
          p_request_id: a.requestId,
        }),
      )
    },
    onSuccess: invalidate,
  })
}

/** QR bank/e-wallet transfers remain pending until the landlord verifies receipt. */
export function useSubmitQrPayment() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: async (a: {
      accountId: string
      billId: string
      tenantId: string
      amount: number
      paidOn: string
      reference: string
      notes: string | null
      proof: File
      requestId: string
    }) => {
      const problem = validateQrProof(a.proof)
      if (problem) throw new Error(problem)
      const proofPath = await uploadProof(a.tenantId, a.proof)
      return call(
        supabase.rpc('submit_qr_payment', {
          p_bill_id: a.billId,
          p_payment_account_id: a.accountId,
          p_amount: a.amount,
          p_paid_on: a.paidOn,
          p_proof_path: proofPath,
          p_reference_number: a.reference,
          p_notes: a.notes,
          p_request_id: a.requestId,
        }),
      )
    },
    onSuccess: invalidate,
  })
}

export function useSavePaymentAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (account: {
      accountId: string | null
      method: Enums<'payment_method'>
      accountHolder: string
      accountNumber: string
      bankName: string | null
      qrPath: string
      active: boolean
      isDefault: boolean
    }) =>
      call(
        supabase.rpc('save_payment_account', {
          p_account_id: account.accountId,
          p_method: account.method,
          p_account_holder: account.accountHolder,
          p_account_number: account.accountNumber,
          p_bank_name: account.bankName,
          p_qr_path: account.qrPath,
          p_is_active: account.active,
          p_is_default: account.isDefault,
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: paymentKeys.accounts() }),
        qc.invalidateQueries({ queryKey: paymentKeys.all }),
      ])
    },
  })
}

// Online payments (provider checkout) ------------------------------------------------------

/** Opens (or reuses) the provider's hosted checkout for a bill; resolves to the page to send the tenant to. */
export function useStartOnlinePayment() {
  return useMutation({
    mutationFn: (a: { billId: string; amount: number }) =>
      invokeFunction<{ checkout_url: string }>('online-payment', { action: 'start', bill_id: a.billId, amount: a.amount }),
  })
}

/** The tenant came back from the checkout without paying. */
export function useCancelOnlinePayment() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (checkoutId: string) =>
      invokeFunction<{ status: string }>('online-payment', { action: 'cancel', checkout_id: checkoutId }),
    onSettled: invalidate,
  })
}
