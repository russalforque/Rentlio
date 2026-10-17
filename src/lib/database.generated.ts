export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      financial_categories: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          transaction_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          transaction_type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transaction_audit: {
        Row: {
          actor_id: string
          created_at: string
          event: string
          id: number
          new_record: Json | null
          old_record: Json | null
          transaction_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event: string
          id?: never
          new_record?: Json | null
          old_record?: Json | null
          transaction_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event?: string
          id?: never
          new_record?: Json | null
          old_record?: Json | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transaction_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transaction_audit_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          receipt_path: string | null
          room_id: string | null
          tenant_id: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          receipt_path?: string | null
          room_id?: string | null
          tenant_id?: string | null
          transaction_date: string
          transaction_type: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          receipt_path?: string | null
          room_id?: string | null
          tenant_id?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_audit_log: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          event: Database["public"]["Enums"]["account_event"]
          id: number
          request_id: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event: Database["public"]["Enums"]["account_event"]
          id?: never
          request_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event?: Database["public"]["Enums"]["account_event"]
          id?: never
          request_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_audit_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "registration_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_payment_accounts: {
        Row: {
          account_holder: string
          account_number: string
          bank_name: string | null
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          is_default: boolean
          landlord_id: string
          method: Database["public"]["Enums"]["payment_method"]
          qr_path: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          account_holder: string
          account_number: string
          bank_name?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          landlord_id: string
          method: Database["public"]["Enums"]["payment_method"]
          qr_path: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          account_holder?: string
          account_number?: string
          bank_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          landlord_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          qr_path?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_payment_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payment_accounts_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payment_accounts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_account_audit: {
        Row: {
          account_id: string
          actor_id: string
          created_at: string
          details: Json
          event: string
          id: number
          landlord_id: string
        }
        Insert: {
          account_id: string
          actor_id: string
          created_at?: string
          details?: Json
          event: string
          id?: number
          landlord_id: string
        }
        Update: {
          account_id?: string
          actor_id?: string
          created_at?: string
          details?: Json
          event?: string
          id?: number
          landlord_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          auto_billing_enabled: boolean
          billing_day: number
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          currency_code: string
          due_days: number
          electricity_rate: number
          house_rules: string | null
          id: boolean
          online_payments_enabled: boolean
          payment_instructions: string | null
          property_address: string | null
          property_name: string
          reminder_days_after: number
          reminder_days_before: number
          reminder_on_due_date: boolean
          rent_reminders_enabled: boolean
          timezone: string
          updated_at: string
          water_billing_mode: Database["public"]["Enums"]["water_billing_mode"]
          water_flat_fee: number
          water_rate: number
        }
        Insert: {
          auto_billing_enabled?: boolean
          billing_day?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          currency_code?: string
          due_days?: number
          electricity_rate?: number
          house_rules?: string | null
          id?: boolean
          online_payments_enabled?: boolean
          payment_instructions?: string | null
          property_address?: string | null
          property_name?: string
          reminder_days_after?: number
          reminder_days_before?: number
          reminder_on_due_date?: boolean
          rent_reminders_enabled?: boolean
          timezone?: string
          updated_at?: string
          water_billing_mode?: Database["public"]["Enums"]["water_billing_mode"]
          water_flat_fee?: number
          water_rate?: number
        }
        Update: {
          auto_billing_enabled?: boolean
          billing_day?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          currency_code?: string
          due_days?: number
          electricity_rate?: number
          house_rules?: string | null
          id?: boolean
          online_payments_enabled?: boolean
          payment_instructions?: string | null
          property_address?: string | null
          property_name?: string
          reminder_days_after?: number
          reminder_days_before?: number
          reminder_on_due_date?: boolean
          rent_reminders_enabled?: boolean
          timezone?: string
          updated_at?: string
          water_billing_mode?: Database["public"]["Enums"]["water_billing_mode"]
          water_flat_fee?: number
          water_rate?: number
        }
        Relationships: []
      }
      bed_types: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      bill_items: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["bill_item_kind"]
          meter_reading_id: string | null
          quantity: number
          sort_order: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          description: string
          id?: string
          kind: Database["public"]["Enums"]["bill_item_kind"]
          meter_reading_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["bill_item_kind"]
          meter_reading_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_meter_reading_id_fkey"
            columns: ["meter_reading_id"]
            isOneToOne: false
            referencedRelation: "meter_readings"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_runs: {
        Row: {
          bills_created: number
          id: string
          period: string
          ran_at: string
          run_by: string | null
          triggered_by: Database["public"]["Enums"]["billing_trigger"]
        }
        Insert: {
          bills_created: number
          id?: string
          period: string
          ran_at?: string
          run_by?: string | null
          triggered_by: Database["public"]["Enums"]["billing_trigger"]
        }
        Update: {
          bills_created?: number
          id?: string
          period?: string
          ran_at?: string
          run_by?: string | null
          triggered_by?: Database["public"]["Enums"]["billing_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "billing_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount_paid: number
          balance: number | null
          bill_number: number
          created_at: string
          due_date: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          issue_date: string
          lease_id: string
          notes: string | null
          period: string
          revision: number
          room_id: string
          status: Database["public"]["Enums"]["bill_status"]
          tenant_id: string
          total_amount: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount_paid?: number
          balance?: number | null
          bill_number?: never
          created_at?: string
          due_date: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          issue_date: string
          lease_id: string
          notes?: string | null
          period: string
          revision?: number
          room_id: string
          status?: Database["public"]["Enums"]["bill_status"]
          tenant_id: string
          total_amount?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance?: number | null
          bill_number?: never
          created_at?: string
          due_date?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          issue_date?: string
          lease_id?: string
          notes?: string | null
          period?: string
          revision?: number
          room_id?: string
          status?: Database["public"]["Enums"]["bill_status"]
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["lease_id"]
          },
          {
            foreignKeyName: "bills_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["lease_id"]
          },
          {
            foreignKeyName: "bills_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          lease_id: string
          notes: string | null
          recorded_by: string
          tenant_id: string
          transaction_date: string
          type: Database["public"]["Enums"]["deposit_txn_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          lease_id: string
          notes?: string | null
          recorded_by: string
          tenant_id: string
          transaction_date: string
          type: Database["public"]["Enums"]["deposit_txn_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          lease_id?: string
          notes?: string | null
          recorded_by?: string
          tenant_id?: string
          transaction_date?: string
          type?: Database["public"]["Enums"]["deposit_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "deposit_transactions_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["lease_id"]
          },
          {
            foreignKeyName: "deposit_transactions_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["lease_id"]
          },
          {
            foreignKeyName: "deposit_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "deposit_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "deposit_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          monthly_rent: number
          notes: string | null
          occupant_count: number
          room_id: string
          start_date: string
          status: Database["public"]["Enums"]["lease_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          monthly_rent: number
          notes?: string | null
          occupant_count?: number
          room_id: string
          start_date: string
          status?: Database["public"]["Enums"]["lease_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          monthly_rent?: number
          notes?: string | null
          occupant_count?: number
          room_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["lease_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_occupant_audit: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          lease_id: string
          new_count: number
          previous_count: number
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          lease_id: string
          new_count: number
          previous_count: number
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          lease_id?: string
          new_count?: number
          previous_count?: number
        }
        Relationships: []
      }
      meter_readings: {
        Row: {
          created_at: string
          electricity_current: number | null
          electricity_previous: number | null
          id: string
          period: string
          recorded_by: string | null
          room_id: string
          updated_at: string
          water_current: number | null
          water_previous: number | null
        }
        Insert: {
          created_at?: string
          electricity_current?: number | null
          electricity_previous?: number | null
          id?: string
          period: string
          recorded_by?: string | null
          room_id: string
          updated_at?: string
          water_current?: number | null
          water_previous?: number | null
        }
        Update: {
          created_at?: string
          electricity_current?: number | null
          electricity_previous?: number | null
          id?: string
          period?: string
          recorded_by?: string | null
          room_id?: string
          updated_at?: string
          water_current?: number | null
          water_previous?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "meter_readings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      water_rate_schedule: {
        Row: {
          changed_by: string | null
          created_at: string
          effective_from: string
          id: string
          monthly_rate: number
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          effective_from: string
          id?: string
          monthly_rate: number
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          effective_from?: string
          id?: string
          monthly_rate?: number
        }
        Relationships: []
      }
      bill_due_date_audit: {
        Row: {
          bill_id: string
          changed_at: string
          changed_by: string
          id: string
          new_date: string
          previous_date: string
          reason: string
        }
        Insert: {
          bill_id: string
          changed_at?: string
          changed_by: string
          id?: string
          new_date: string
          previous_date: string
          reason: string
        }
        Update: {
          bill_id?: string
          changed_at?: string
          changed_by?: string
          id?: string
          new_date?: string
          previous_date?: string
          reason?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          announcements: boolean
          general_updates: boolean
          payment_updates: boolean
          rent_reminders: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          announcements?: boolean
          general_updates?: boolean
          payment_updates?: boolean
          rent_reminders?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          announcements?: boolean
          general_updates?: boolean
          payment_updates?: boolean
          rent_reminders?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string
          deduplication_key: string
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          recipient_user_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          category: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          deduplication_key: string
          id?: string
          is_read?: boolean
          message: string
          read_at?: string | null
          recipient_user_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          deduplication_key?: string
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          recipient_user_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          bill_id: string
          bill_item_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["bill_item_kind"]
          payment_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          bill_item_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["bill_item_kind"]
          payment_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          bill_item_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["bill_item_kind"]
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_checkouts: {
        Row: {
          amount: number
          bill_id: string
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          currency_code: string
          expires_at: string
          failure_reason: string | null
          id: string
          payment_id: string | null
          provider: string
          provider_session_id: string | null
          status: Database["public"]["Enums"]["checkout_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bill_id: string
          checkout_url?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          currency_code: string
          expires_at?: string
          failure_reason?: string | null
          id?: string
          payment_id?: string | null
          provider?: string
          provider_session_id?: string | null
          status?: Database["public"]["Enums"]["checkout_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bill_id?: string
          checkout_url?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          expires_at?: string
          failure_reason?: string | null
          id?: string
          payment_id?: string | null
          provider?: string
          provider_session_id?: string | null
          status?: Database["public"]["Enums"]["checkout_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_checkouts_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_checkouts_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_checkouts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_checkouts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_checkouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bill_id: string
          client_request_id: string | null
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_on: string
          payment_account_id: string | null
          payment_account_snapshot: Json | null
          proof_path: string | null
          provider: string | null
          provider_payment_id: string | null
          receipt_number: number | null
          reference_number: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          submitted_by: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bill_id: string
          client_request_id?: string | null
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on: string
          payment_account_id?: string | null
          payment_account_snapshot?: Json | null
          proof_path?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          receipt_number?: number | null
          reference_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_by: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bill_id?: string
          client_request_id?: string | null
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          payment_account_id?: string | null
          payment_account_snapshot?: Json | null
          proof_path?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          receipt_number?: number | null
          reference_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_by?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activated_at: string | null
          avatar_path: string | null
          created_at: string
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          id: string
          invited_at: string | null
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      registration_requests: {
        Row: {
          created_at: string
          email: string
          email_verified_at: string | null
          full_name: string
          id: string
          identity_check: Database["public"]["Enums"]["identity_check"] | null
          phone: string | null
          requested_room: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: Database["public"]["Enums"]["registration_source"]
          status: Database["public"]["Enums"]["registration_status"]
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          email_verified_at?: string | null
          full_name?: string
          id?: string
          identity_check?: Database["public"]["Enums"]["identity_check"] | null
          phone?: string | null
          requested_room?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["registration_source"]
          status?: Database["public"]["Enums"]["registration_status"]
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          email_verified_at?: string | null
          full_name?: string
          id?: string
          identity_check?: Database["public"]["Enums"]["identity_check"] | null
          phone?: string | null
          requested_room?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["registration_source"]
          status?: Database["public"]["Enums"]["registration_status"]
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      room_beds: {
        Row: {
          bed_type_id: string
          quantity: number
          room_id: string
        }
        Insert: {
          bed_type_id: string
          quantity: number
          room_id: string
        }
        Update: {
          bed_type_id?: string
          quantity?: number
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_beds_bed_type_id_fkey"
            columns: ["bed_type_id"]
            isOneToOne: false
            referencedRelation: "bed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_beds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_beds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          created_at: string
          description: string | null
          floor: number | null
          id: string
          is_under_maintenance: boolean
          monthly_rent: number
          room_number: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          description?: string | null
          floor?: number | null
          id?: string
          is_under_maintenance?: boolean
          monthly_rent?: number
          room_number: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          description?: string | null
          floor?: number | null
          id?: string
          is_under_maintenance?: boolean
          monthly_rent?: number
          room_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_documents: {
        Row: {
          created_at: string
          file_path: string
          id: string
          lease_id: string | null
          tenant_id: string
          title: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          lease_id?: string | null
          tenant_id: string
          title: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          lease_id?: string | null
          tenant_id?: string
          title?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["lease_id"]
          },
          {
            foreignKeyName: "tenant_documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["lease_id"]
          },
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      financial_transaction_overview: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          payment_id: string | null
          receipt_path: string | null
          room_id: string | null
          room_number: string | null
          source: string | null
          tenant_id: string | null
          tenant_name: string | null
          transaction_date: string | null
          transaction_type: string | null
        }
        Relationships: []
      }
      bill_overview: {
        Row: {
          amount_paid: number | null
          balance: number | null
          bill_number: number | null
          created_at: string | null
          due_date: string | null
          electricity_amount: number | null
          electricity_paid: number | null
          finalized_at: string | null
          id: string | null
          is_finalized: boolean | null
          is_overdue: boolean | null
          issue_date: string | null
          lease_id: string | null
          missing_charges: string[] | null
          notes: string | null
          other_amount: number | null
          other_paid: number | null
          pending_amount: number | null
          pending_payments: number | null
          period: string | null
          rent_amount: number | null
          rent_paid: number | null
          revision: number | null
          room_id: string | null
          room_number: string | null
          status: Database["public"]["Enums"]["bill_status"] | null
          tenant_email: string | null
          tenant_id: string | null
          tenant_name: string | null
          total_amount: number | null
          void_reason: string | null
          voided_at: string | null
          water_amount: number | null
          water_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["lease_id"]
          },
          {
            foreignKeyName: "bills_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["lease_id"]
          },
          {
            foreignKeyName: "bills_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_balances: {
        Row: {
          balance: number | null
          tenant_id: string | null
          total_deducted: number | null
          total_received: number | null
          total_refunded: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "deposit_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_overview: {
        Row: {
          amount: number | null
          bill_balance: number | null
          bill_id: string | null
          bill_number: number | null
          bill_status: Database["public"]["Enums"]["bill_status"] | null
          created_at: string | null
          id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          paid_on: string | null
          period: string | null
          payment_account_id: string | null
          payment_account_snapshot: Json | null
          proof_path: string | null
          provider: string | null
          receipt_number: number | null
          recorded_by_landlord: boolean | null
          reference_number: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_number: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          submitted_by: string | null
          tenant_id: string | null
          tenant_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      room_overview: {
        Row: {
          capacity: number | null
          description: string | null
          floor: number | null
          id: string | null
          is_under_maintenance: boolean | null
          lease_id: string | null
          lease_rent: number | null
          lease_start_date: string | null
          monthly_rent: number | null
          occupancy: string | null
          outstanding_balance: number | null
          room_number: string | null
          tenant_email: string | null
          tenant_id: string | null
          tenant_name: string | null
          tenant_phone: string | null
        }
        Relationships: []
      }
      tenant_overview: {
        Row: {
          account_status: string | null
          activated_at: string | null
          avatar_path: string | null
          created_at: string | null
          deposit_balance: number | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          id: string | null
          invited_at: string | null
          is_active: boolean | null
          lease_id: string | null
          lease_rent: number | null
          lease_start_date: string | null
          outstanding_balance: number | null
          phone: string | null
          room_id: string | null
          room_number: string | null
          has_portal_access: boolean | null
          suspended_at: string | null
          suspension_reason: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leases_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_financial_category: {
        Args: { p_name: string; p_transaction_type: string }
        Returns: string
      }
      delete_financial_transaction: { Args: { p_id: string }; Returns: undefined }
      save_financial_transaction: {
        Args: {
          p_amount: number
          p_category: string
          p_description: string
          p_id?: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_receipt_path?: string
          p_room_id?: string
          p_tenant_id?: string
          p_transaction_date: string
          p_transaction_type: string
        }
        Returns: string
      }
      _assert_active_user: { Args: never; Returns: string }
      _assert_landlord: { Args: never; Returns: undefined }
      _generate_bills: { Args: { p_period: string }; Returns: number }
      _refresh_bill: { Args: { p_bill_id: string }; Returns: undefined }
      _sync_bill_utilities: { Args: { p_bill_id: string }; Returns: undefined }
      _link_invited_user: {
        Args: {
          p_actor_id: string
          p_full_name?: string
          p_phone?: string
          p_tenant_id?: string
          p_user_id: string
        }
        Returns: string
      }
      add_bill_charge: {
        Args: { p_amount: number; p_bill_id: string; p_description: string }
        Returns: string
      }
      assign_tenant: {
        Args: {
          p_deposit_amount?: number
          p_monthly_rent?: number
          p_notes?: string
          p_room_id: string
          p_start_date: string
          p_tenant_id: string
        }
        Returns: string
      }
      approve_registration: {
        Args: {
          p_identity_check: Database["public"]["Enums"]["identity_check"]
          p_note: string
          p_request_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      bill_missing_charges: { Args: { p_bill_id: string }; Returns: string[] }
      bootstrap_landlord: { Args: { p_email: string }; Returns: string }
      cancel_online_payment: {
        Args: { p_checkout_id: string }
        Returns: Database["public"]["Tables"]["payment_checkouts"]["Row"]
      }
      create_manual_tenant: {
        Args: {
          p_deposit_amount?: number
          p_full_name: string
          p_monthly_rent?: number
          p_phone?: string
          p_room_id?: string
          p_start_date?: string
        }
        Returns: string
      }
      current_profile_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      end_lease: {
        Args: { p_end_date: string; p_lease_id: string }
        Returns: undefined
      }
      finalize_bill: {
        Args: { p_bill_id: string; p_skip_missing?: boolean }
        Returns: undefined
      }
      finalize_bills: { Args: { p_period: string }; Returns: number }
      generate_bills: { Args: { p_period: string }; Returns: number }
      is_landlord: { Args: never; Returns: boolean }
      mark_account_activated: { Args: never; Returns: undefined }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number }
      override_bill_due_date: { Args: { p_bill_id: string; p_due_date: string; p_reason: string }; Returns: undefined }
      meter_reading_sheet: {
        Args: { p_period: string }
        Returns: {
          bill_finalized: boolean
          bill_id: string
          electricity_current: number
          electricity_previous: number
          floor: number
          is_billable: boolean
          reading_id: string
          room_id: string
          room_number: string
          tenant_name: string
          water_current: number
          water_previous: number
        }[]
      }
      my_registration: {
        Args: never
        Returns: {
          email: string
          email_verified: boolean
          full_name: string
          rejection_reason: string
          requested_room: string
          status: Database["public"]["Enums"]["registration_status"]
          submitted_at: string
        }[]
      }
      move_tenant: {
        Args: {
          p_lease_id: string
          p_monthly_rent?: number
          p_move_date: string
          p_room_id: string
        }
        Returns: string
      }
      payment_receipt: { Args: { p_payment_id: string }; Returns: Json }
      property_today: { Args: never; Returns: string }
      record_deposit_transaction: {
        Args: {
          p_amount: number
          p_date: string
          p_lease_id: string
          p_notes?: string
          p_type: Database["public"]["Enums"]["deposit_txn_type"]
        }
        Returns: string
      }
      record_meter_readings: {
        Args: { p_period: string; p_readings: Json }
        Returns: number
      }
      record_payment: {
        Args: {
          p_amount: number
          p_bill_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_notes?: string
          p_paid_on: string
          p_proof_path?: string
          p_reference_number?: string
          p_request_id?: string
        }
        Returns: string
      }
      remove_bill_charge: { Args: { p_item_id: string }; Returns: undefined }
      reopen_bill: { Args: { p_bill_id: string }; Returns: undefined }
      reject_registration: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      review_payment: {
        Args: {
          p_amount?: number
          p_approve: boolean
          p_payment_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      review_payment_confirmed: {
        Args: {
          p_amount?: number
          p_approve: boolean
          p_money_received?: boolean
          p_payment_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      save_payment_account: {
        Args: {
          p_account_holder: string
          p_account_id: string | null
          p_account_number: string
          p_bank_name: string | null
          p_is_active: boolean
          p_is_default: boolean
          p_method: Database["public"]["Enums"]["payment_method"]
          p_qr_path: string
        }
        Returns: string
      }
      run_scheduled_billing: { Args: never; Returns: number }
      send_announcement: {
        Args: { p_message: string; p_title: string }
        Returns: number
      }
      set_portal_suspended: {
        Args: { p_reason?: string; p_suspended: boolean; p_tenant_id: string }
        Returns: undefined
      }
      set_room_beds: {
        Args: { p_beds: Json; p_room_id: string }
        Returns: undefined
      }
      set_lease_occupants: { Args: { p_lease_id: string; p_occupant_count: number }; Returns: undefined }
      set_water_rate: { Args: { p_monthly_rate: number; p_effective_from: string }; Returns: string }
      start_online_payment: {
        Args: { p_amount: number; p_bill_id: string }
        Returns: Database["public"]["Tables"]["payment_checkouts"]["Row"]
      }
      set_tenant_active: {
        Args: { p_active: boolean; p_tenant_id: string }
        Returns: undefined
      }
      submit_payment: {
        Args: {
          p_amount: number
          p_bill_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_notes?: string
          p_paid_on: string
          p_proof_path: string
          p_reference_number?: string
          p_request_id?: string
        }
        Returns: string
      }
      submit_qr_payment: {
        Args: {
          p_amount: number
          p_bill_id: string
          p_notes: string | null
          p_paid_on: string
          p_payment_account_id: string
          p_proof_path: string
          p_reference_number: string
          p_request_id: string
        }
        Returns: string
      }
      update_bill_item: {
        Args: { p_amount: number; p_description: string; p_item_id: string }
        Returns: undefined
      }
      update_lease_rent: {
        Args: { p_lease_id: string; p_monthly_rent: number }
        Returns: undefined
      }
      void_bill: {
        Args: { p_bill_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      account_event:
        | "login_created"
        | "email_verified"
        | "registration_approved"
        | "registration_rejected"
        | "account_linked"
        | "portal_invited"
        | "manual_tenant_created"
        | "account_suspended"
        | "account_unsuspended"
      bill_item_kind: "rent" | "electricity" | "water" | "other"
      bill_status: "unpaid" | "partial" | "paid" | "void"
      billing_trigger: "schedule" | "manual"
      checkout_status:
        | "creating"
        | "open"
        | "paid"
        | "expired"
        | "failed"
        | "cancelled"
      deposit_txn_type: "received" | "deduction" | "refund"
      identity_check: "existing_record" | "in_person" | "invitation"
      lease_status: "active" | "ended"
      notification_category: "payment" | "billing" | "account" | "rental" | "system"
      notification_type:
        | "registration_submitted"
        | "payment_submitted"
        | "tenant_activated"
        | "move_in_today"
        | "move_out_today"
        | "bills_due_soon"
        | "bills_overdue"
        | "bills_generated"
        | "billing_failed"
        | "system_error"
        | "registration_approved"
        | "registration_rejected"
        | "bill_issued"
        | "bill_voided"
        | "rent_due_soon"
        | "rent_due_today"
        | "rent_overdue"
        | "payment_rejected"
        | "lease_started"
        | "lease_updated"
        | "lease_ended"
        | "announcement"
        | "payment_verified"
        | "payment_recorded"
        | "payment_account_updated"
        | "water_rate_changed"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "gcash"
        | "maya"
        | "check"
        | "card"
        | "other"
      payment_status: "pending" | "verified" | "rejected"
      registration_source: "self_signup" | "invitation"
      registration_status: "pending" | "approved" | "rejected"
      user_role: "landlord" | "tenant"
      water_billing_mode: "metered" | "flat"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_event: [
        "login_created",
        "email_verified",
        "registration_approved",
        "registration_rejected",
        "account_linked",
        "portal_invited",
        "manual_tenant_created",
        "account_suspended",
        "account_unsuspended",
      ],
      bill_item_kind: ["rent", "electricity", "water", "other"],
      bill_status: ["unpaid", "partial", "paid", "void"],
      billing_trigger: ["schedule", "manual"],
      checkout_status: ["creating", "open", "paid", "expired", "failed", "cancelled"],
      deposit_txn_type: ["received", "deduction", "refund"],
      identity_check: ["existing_record", "in_person", "invitation"],
      lease_status: ["active", "ended"],
      notification_category: ["payment", "billing", "account", "rental", "system"],
      notification_type: [
        "registration_submitted",
        "payment_submitted",
        "tenant_activated",
        "move_in_today",
        "move_out_today",
        "bills_due_soon",
        "bills_overdue",
        "bills_generated",
        "billing_failed",
        "system_error",
        "registration_approved",
        "registration_rejected",
        "bill_issued",
        "bill_voided",
        "rent_due_soon",
        "rent_due_today",
        "rent_overdue",
        "payment_rejected",
        "lease_started",
        "lease_updated",
        "lease_ended",
        "announcement",
        "payment_verified",
        "payment_recorded",
        "payment_account_updated",
        "water_rate_changed",
      ],
      payment_method: [
        "cash",
        "bank_transfer",
        "gcash",
        "maya",
        "check",
        "card",
        "other",
      ],
      payment_status: ["pending", "verified", "rejected"],
      registration_source: ["self_signup", "invitation"],
      registration_status: ["pending", "approved", "rejected"],
      user_role: ["landlord", "tenant"],
      water_billing_mode: ["metered", "flat"],
    },
  },
} as const
