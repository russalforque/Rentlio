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
          payment_instructions: string | null
          property_address: string | null
          property_name: string
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
          payment_instructions?: string | null
          property_address?: string | null
          property_name?: string
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
          payment_instructions?: string | null
          property_address?: string | null
          property_name?: string
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
          id: string
          issue_date: string
          lease_id: string
          notes: string | null
          period: string
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
          id?: string
          issue_date: string
          lease_id: string
          notes?: string | null
          period: string
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
          id?: string
          issue_date?: string
          lease_id?: string
          notes?: string | null
          period?: string
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
      payments: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_on: string
          proof_path: string | null
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
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on: string
          proof_path?: string | null
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
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          proof_path?: string | null
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
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          id: string
          invited_at: string | null
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          avatar_path?: string | null
          created_at?: string
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id: string
          invited_at?: string | null
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          avatar_path?: string | null
          created_at?: string
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
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
      bill_overview: {
        Row: {
          amount_paid: number | null
          balance: number | null
          bill_number: number | null
          created_at: string | null
          due_date: string | null
          id: string | null
          is_overdue: boolean | null
          issue_date: string | null
          lease_id: string | null
          notes: string | null
          pending_amount: number | null
          pending_payments: number | null
          period: string | null
          room_id: string | null
          room_number: string | null
          status: Database["public"]["Enums"]["bill_status"] | null
          tenant_email: string | null
          tenant_id: string | null
          tenant_name: string | null
          total_amount: number | null
          void_reason: string | null
          voided_at: string | null
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
          proof_path: string | null
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
      _assert_active_user: { Args: never; Returns: string }
      _assert_landlord: { Args: never; Returns: undefined }
      _generate_bills: { Args: { p_period: string }; Returns: number }
      _refresh_bill: { Args: { p_bill_id: string }; Returns: undefined }
      _sync_bill_utilities: { Args: { p_bill_id: string }; Returns: undefined }
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
      end_lease: {
        Args: { p_end_date: string; p_lease_id: string }
        Returns: undefined
      }
      generate_bills: { Args: { p_period: string }; Returns: number }
      is_landlord: { Args: never; Returns: boolean }
      mark_account_activated: { Args: never; Returns: undefined }
      meter_reading_sheet: {
        Args: { p_period: string }
        Returns: {
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
      move_tenant: {
        Args: {
          p_lease_id: string
          p_monthly_rent?: number
          p_move_date: string
          p_room_id: string
        }
        Returns: string
      }
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
        }
        Returns: string
      }
      remove_bill_charge: { Args: { p_item_id: string }; Returns: undefined }
      review_payment: {
        Args: {
          p_amount?: number
          p_approve: boolean
          p_payment_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      run_scheduled_billing: { Args: never; Returns: number }
      set_room_beds: {
        Args: { p_beds: Json; p_room_id: string }
        Returns: undefined
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
      bill_item_kind: "rent" | "electricity" | "water" | "other"
      bill_status: "unpaid" | "partial" | "paid" | "void"
      billing_trigger: "schedule" | "manual"
      deposit_txn_type: "received" | "deduction" | "refund"
      lease_status: "active" | "ended"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "gcash"
        | "maya"
        | "check"
        | "other"
      payment_status: "pending" | "verified" | "rejected"
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
      bill_item_kind: ["rent", "electricity", "water", "other"],
      bill_status: ["unpaid", "partial", "paid", "void"],
      billing_trigger: ["schedule", "manual"],
      deposit_txn_type: ["received", "deduction", "refund"],
      lease_status: ["active", "ended"],
      payment_method: [
        "cash",
        "bank_transfer",
        "gcash",
        "maya",
        "check",
        "other",
      ],
      payment_status: ["pending", "verified", "rejected"],
      user_role: ["landlord", "tenant"],
      water_billing_mode: ["metered", "flat"],
    },
  },
} as const
