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

export type ViewRows = {
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
      tenant_email: string
      tenant_id: string
      tenant_name: string
      total_amount: number
      void_reason: string | null
      voided_at: string | null
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
      account_status: 'invited' | 'active' | 'inactive'
      activated_at: string | null
      avatar_path: string | null
      created_at: string
      deposit_balance: number
      email: string
      emergency_contact_name: string | null
      emergency_contact_phone: string | null
      full_name: string
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
  end_lease: { Args: { p_lease_id: string; p_end_date: string }; Returns: undefined }
  generate_bills: { Args: { p_period: string }; Returns: number }
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
    }[]
  }
  move_tenant: {
    Args: { p_lease_id: string; p_room_id: string; p_move_date: string; p_monthly_rent?: number | null }
    Returns: string
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
    }
    Returns: string
  }
  remove_bill_charge: { Args: { p_item_id: string }; Returns: undefined }
  review_payment: {
    Args: { p_payment_id: string; p_approve: boolean; p_amount?: number | null; p_reason?: string | null }
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
    }
    Returns: string
  }
  update_bill_item: { Args: { p_item_id: string; p_description: string | null; p_amount: number }; Returns: undefined }
  update_lease_rent: { Args: { p_lease_id: string; p_monthly_rent: number }; Returns: undefined }
  void_bill: { Args: { p_bill_id: string; p_reason: string }; Returns: undefined }
}
