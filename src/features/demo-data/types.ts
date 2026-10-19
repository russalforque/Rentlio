import { z } from 'zod'
import type { Json } from '@/lib/database.generated'

// Public RPCs only. The private schema is never exposed through the Data API.
export type DemoFunctions = {
  demo_list_batches: { Args: never; Returns: Json }
  demo_generate_batch: { Args: { p_request_id: string }; Returns: string }
  demo_get_batch: { Args: { p_batch_id: string }; Returns: Json }
  demo_record_payment: { Args: { p_batch_id: string; p_bill_id: string; p_amount: number; p_method: string; p_paid_on: string; p_request_id: string; p_status?: string }; Returns: string }
  demo_review_payment: { Args: { p_batch_id: string; p_payment_id: string; p_approve: boolean; p_reason?: string }; Returns: undefined }
  demo_save_cash_opening: { Args: { p_batch_id: string; p_date: string; p_amount: number }; Returns: undefined }
  demo_record_expense: { Args: { p_batch_id: string; p_date: string; p_amount: number; p_description: string; p_request_id: string }; Returns: string }
  demo_delete_batch: { Args: { p_batch_id: string; p_expected_revision: number }; Returns: Json }
}

const id = z.string().uuid()
const money = z.number().finite().nonnegative()
export const demoBatchSchema = z.object({
  id, label: z.string(), created_at: z.string(), starts_on: z.string(), revision: z.number().int().nonnegative(),
})
export const demoCountsSchema = z.object({
  batches: z.number().int(), tenants: z.number().int(), rooms: z.number().int(), leases: z.number().int(),
  bills: z.number().int(), bill_items: z.number().int(), payments: z.number().int(),
  payment_allocations: z.number().int(), expenses: z.number().int(), cash_openings: z.number().int(),
})
export const demoSnapshotSchema = z.object({
  batch: demoBatchSchema,
  today: z.string(), counts: demoCountsSchema,
  tenants: z.array(z.object({ id, full_name: z.string() })),
  rooms: z.array(z.object({ id, room_number: z.string() })),
  leases: z.array(z.object({ id, tenant_id: id, room_id: id, monthly_rent: money, start_date: z.string() })),
  bills: z.array(z.object({ id, lease_id: id, period: z.string(), due_date: z.string(), tenant_name: z.string(), room_number: z.string(), total_amount: money, amount_paid: money })),
  bill_items: z.array(z.object({ id, bill_id: id, kind: z.enum(['rent', 'electricity', 'water', 'other']), description: z.string(), amount: money, sort_order: z.number() })),
  payments: z.array(z.object({ id, bill_id: id, amount: money, method: z.string(), paid_on: z.string(), status: z.enum(['pending', 'verified', 'rejected']), receipt_number: z.number().nullable(), balance_before: money.nullable(), balance_after: money.nullable(), rejection_reason: z.string().nullable(), created_at: z.string() })),
  allocations: z.array(z.object({ payment_id: id, bill_item_id: id, bill_id: id, kind: z.string(), amount: money })),
  expenses: z.array(z.object({ id, amount: money, paid_on: z.string(), description: z.string() })),
  openings: z.array(z.object({ opening_date: z.string(), opening_cash: money, updated_at: z.string(), updated_by: id })),
})
export const demoDeletionSchema = z.object({ batch_id: id, removed: demoCountsSchema })
export type DemoBatch = z.infer<typeof demoBatchSchema>
export type DemoSnapshot = z.infer<typeof demoSnapshotSchema>
export type DemoCounts = z.infer<typeof demoCountsSchema>
export type DemoDeletion = z.infer<typeof demoDeletionSchema>
export type DemoPayment = DemoSnapshot['payments'][number]

export const DEMO_COUNT_LABELS: Record<keyof DemoCounts, string> = {
  batches: 'Batch', tenants: 'Tenants', rooms: 'Rooms', leases: 'Rental agreements', bills: 'Monthly bills',
  bill_items: 'Bill charge lines', payments: 'Payments', payment_allocations: 'Payment allocations',
  expenses: 'Expenses', cash_openings: 'Cash openings',
}
