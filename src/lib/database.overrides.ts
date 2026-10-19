// Precise types layered over the generated ones (see database.types.ts).
//
// Postgres reports every view column as nullable and every function result
// column as non-null, and the generator types optional function arguments
// without null. These definitions state what the views and functions actually
// guarantee and accept. database.types.ts checks at compile time that they
// still match the generated schema, so a migration that changes a view or a
// function signature breaks the build instead of drifting silently.
import type { Database as Generated, Json } from './database.generated'

type E = Generated['public']['Enums']
type Checkout = Generated['public']['Tables']['payment_checkouts']['Row']

/** What payment_receipt() returns for a verified payment the caller may see. */
export interface PaymentReceipt {
  receipt_number: number
  payment: {
    id: string
    amount: number
    method: E['payment_method']
    paid_on: string
    reference_number: string | null
    provider: string | null
    verified_at: string
    recorded_by_landlord: boolean
  }
  bill: { id: string; bill_number: number; period: string; issue_date: string; due_date: string; total_amount: number }
  tenant_name: string
  room_number: string
  property: {
    name: string
    address: string | null
    currency_code: string
    contact_name: string | null
    contact_phone: string | null
    contact_email: string | null
  }
  /** Every charge on the bill: what was paid before this payment, what this payment paid, what is left. */
  lines: {
    kind: E['bill_item_kind']
    description: string
    amount: number
    paid_before: number
    applied: number
    remaining: number
  }[]
  balance_before: number
  balance_after: number
}

export type ViewRows = {
  financial_transaction_overview: {
    Row: {
      amount: number
      category: string
      created_at: string
      description: string
      id: string
      method: E['payment_method']
      payment_id: string | null
      receipt_path: string | null
      room_id: string | null
      room_number: string | null
      source: 'manual' | 'payment'
      tenant_id: string | null
      tenant_name: string | null
      transaction_date: string
      transaction_type: 'income' | 'expense'
    }
    Relationships: []
  }
  bill_overview: {
    Row: {
      amount_paid: number
      balance: number
      bill_number: number
      created_at: string
      due_date: string
      id: string
      is_overdue: boolean
      issue_date: string
      lease_id: string
      notes: string | null
      pending_amount: number
      pending_payments: number
      period: string
      room_id: string
      room_number: string
      status: E['bill_status']
      tenant_email: string | null
      tenant_id: string
      tenant_name: string
      total_amount: number
      void_reason: string | null
      voided_at: string | null
      /** Draft bills are invisible to tenants and cannot take payments. */
      is_finalized: boolean
      finalized_at: string | null
      /** Times finalized; above 1 means it was corrected after being issued. */
      revision: number
      /** Required charges a draft still lacks: 'rent' | 'electricity' | 'water'. */
      missing_charges: string[]
      rent_amount: number
      electricity_amount: number
      water_amount: number
      other_amount: number
      /** Collected per charge type, from payment_allocations (see the allocation policy). */
      rent_paid: number
      electricity_paid: number
      water_paid: number
      other_paid: number
    }
    Relationships: []
  }
  payment_overview: {
    Row: {
      amount: number
      bill_balance: number
      bill_id: string
      bill_number: number
      bill_status: E['bill_status']
      created_at: string
      id: string
      method: E['payment_method']
      notes: string | null
      paid_on: string
      payment_account_id: string | null
      payment_account_snapshot: {
        account_holder: string
        account_number: string
        bank_name: string | null
        method: E['payment_method']
      } | null
      period: string
      proof_path: string | null
      recorded_by_landlord: boolean
      reference_number: string | null
      rejection_reason: string | null
      reviewed_at: string | null
      reviewed_by: string | null
      room_number: string
      status: E['payment_status']
      submitted_by: string
      tenant_id: string
      tenant_name: string
      /** Set once verified. */
      receipt_number: number | null
      /** 'paymongo' for provider-verified online payments. */
      provider: string | null
    }
    Relationships: []
  }
  deposit_balances: {
    Row: {
      balance: number
      tenant_id: string
      total_deducted: number
      total_received: number
      total_refunded: number
    }
    Relationships: []
  }
  tenant_overview: {
    Row: {
      /** no_portal: a manual tenant with no login. */
      account_status: 'no_portal' | 'invited' | 'active' | 'suspended' | 'inactive'
      activated_at: string | null
      avatar_path: string | null
      created_at: string
      deposit_balance: number
      email: string | null
      emergency_contact_name: string | null
      emergency_contact_phone: string | null
      full_name: string
      has_portal_access: boolean
      id: string
      invited_at: string | null
      is_active: boolean
      lease_id: string | null
      lease_rent: number | null
      lease_start_date: string | null
      outstanding_balance: number
      phone: string | null
      room_id: string | null
      room_number: string | null
      suspended_at: string | null
      suspension_reason: string | null
    }
    Relationships: []
  }
  room_overview: {
    Row: {
      capacity: number
      description: string | null
      floor: number | null
      id: string
      is_under_maintenance: boolean
      lease_id: string | null
      lease_rent: number | null
      lease_start_date: string | null
      monthly_rent: number
      occupancy: 'vacant' | 'occupied' | 'maintenance'
      outstanding_balance: number
      room_number: string
      tenant_email: string | null
      tenant_id: string | null
      tenant_name: string | null
      tenant_phone: string | null
    }
    Relationships: []
  }
}

export type FunctionOverrides = {
  add_financial_category: { Args: { p_name: string; p_transaction_type: string }; Returns: string }
  record_daily_cash_adjustment: {
    Args: { p_adjustment_date: string; p_amount_delta: number; p_reason: string }
    Returns: string
  }
  save_daily_cash_opening: {
    Args: { p_opening_date: string; p_opening_cash: number }
    Returns: string
  }
  delete_financial_transaction: { Args: { p_id: string }; Returns: undefined }
  save_financial_transaction: {
    Args: {
      p_amount: number
      p_category: string
      p_description: string
      p_id?: string
      p_method: E['payment_method']
      p_receipt_path?: string
      p_room_id?: string
      p_tenant_id?: string
      p_transaction_date: string
      p_transaction_type: string
    }
    Returns: string
  }
  add_bill_charge: { Args: { p_bill_id: string; p_description: string; p_amount: number }; Returns: string }
  assign_tenant: {
    Args: {
      p_tenant_id: string
      p_room_id: string
      p_start_date: string
      p_monthly_rent?: number | null
      p_deposit_amount?: number | null
      p_notes?: string | null
    }
    Returns: string
  }
  approve_registration: {
    Args: {
      p_request_id: string
      p_tenant_id: string | null
      p_identity_check: E['identity_check']
      p_note: string
    }
    Returns: string
  }
  create_manual_tenant: {
    Args: {
      p_full_name: string
      p_phone?: string | null
      p_room_id?: string | null
      p_start_date?: string | null
      p_monthly_rent?: number | null
      p_deposit_amount?: number | null
    }
    Returns: string
  }
  cancel_online_payment: { Args: { p_checkout_id: string }; Returns: Checkout }
  end_lease: { Args: { p_lease_id: string; p_end_date: string }; Returns: undefined }
  finalize_bill: { Args: { p_bill_id: string; p_skip_missing?: boolean }; Returns: undefined }
  finalize_bills: { Args: { p_period: string }; Returns: number }
  generate_bills: { Args: { p_period: string }; Returns: number }
  payment_receipt: { Args: { p_payment_id: string }; Returns: PaymentReceipt | null }
  reopen_bill: { Args: { p_bill_id: string }; Returns: undefined }
  start_online_payment: { Args: { p_bill_id: string; p_amount: number }; Returns: Checkout }
  is_landlord: { Args: never; Returns: boolean }
  meter_reading_sheet: {
    Args: { p_period: string }
    Returns: {
      room_id: string
      room_number: string
      floor: number | null
      tenant_name: string | null
      is_billable: boolean
      reading_id: string | null
      electricity_previous: number | null
      electricity_current: number | null
      water_previous: number | null
      water_current: number | null
      bill_id: string | null
      /** The room's bill for the month is finalized, so its reading is locked. */
      bill_finalized: boolean
      electricity_meters: ('aircon' | 'outlet' | 'light')[]
      aircon_previous: number | null
      aircon_current: number | null
      aircon_reset: boolean
      aircon_event: 'normal' | 'review' | 'reset' | 'replacement' | 'rollover' | null
      aircon_rollover_at: number | null
      outlet_previous: number | null
      outlet_current: number | null
      outlet_reset: boolean
      outlet_event: 'normal' | 'review' | 'reset' | 'replacement' | 'rollover' | null
      outlet_rollover_at: number | null
      light_previous: number | null
      light_current: number | null
      light_reset: boolean
      light_event: 'normal' | 'review' | 'reset' | 'replacement' | 'rollover' | null
      light_rollover_at: number | null
    }[]
  }
  record_room_readings: { Args: { p_period: string; p_readings: Json }; Returns: number }
  move_tenant: {
    Args: { p_lease_id: string; p_room_id: string; p_move_date: string; p_monthly_rent?: number | null }
    Returns: string
  }
  my_registration: {
    Args: never
    Returns: {
      status: E['registration_status']
      full_name: string
      email: string
      requested_room: string | null
      submitted_at: string
      email_verified: boolean
      rejection_reason: string | null
    }[]
  }
  mark_account_activated: { Args: never; Returns: undefined }
  property_today: { Args: never; Returns: string }
  record_deposit_transaction: {
    Args: {
      p_lease_id: string
      p_type: E['deposit_txn_type']
      p_amount: number
      p_date: string
      p_notes?: string | null
    }
    Returns: string
  }
  record_meter_readings: { Args: { p_period: string; p_readings: Json }; Returns: number }
  record_payment: {
    Args: {
      p_bill_id: string
      p_amount: number
      p_method: E['payment_method']
      p_paid_on: string
      p_reference_number?: string | null
      p_notes?: string | null
      p_proof_path?: string | null
      /** Idempotency key: resubmitting the same request returns the first payment. */
      p_request_id?: string | null
    }
    Returns: string
  }
  reject_registration: { Args: { p_request_id: string; p_reason: string }; Returns: undefined }
  remove_bill_charge: { Args: { p_item_id: string }; Returns: undefined }
  review_payment: {
    Args: { p_payment_id: string; p_approve: boolean; p_amount?: number | null; p_reason?: string | null }
    Returns: undefined
  }
  set_portal_suspended: {
    Args: { p_tenant_id: string; p_suspended: boolean; p_reason?: string | null }
    Returns: undefined
  }
  set_tenant_active: { Args: { p_tenant_id: string; p_active: boolean }; Returns: undefined }
  submit_payment: {
    Args: {
      p_bill_id: string
      p_amount: number
      p_method: E['payment_method']
      p_paid_on: string
      p_proof_path: string
      p_reference_number?: string | null
      p_notes?: string | null
      p_request_id?: string | null
    }
    Returns: string
  }
  update_bill_item: { Args: { p_item_id: string; p_description: string | null; p_amount: number }; Returns: undefined }
  update_lease_rent: { Args: { p_lease_id: string; p_monthly_rent: number }; Returns: undefined }
  update_lease_start_date: { Args: { p_lease_id: string; p_start_date: string }; Returns: undefined }
  void_bill: { Args: { p_bill_id: string; p_reason: string }; Returns: undefined }
}
