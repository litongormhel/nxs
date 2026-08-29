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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_logs: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          id: string
          staff_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          id?: string
          staff_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      addons: {
        Row: {
          active: boolean
          id: string
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          price: number
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          allow_receptionist_manual_points: boolean
          id: boolean
        }
        Insert: {
          allow_receptionist_manual_points?: boolean
          id?: boolean
        }
        Update: {
          allow_receptionist_manual_points?: boolean
          id?: boolean
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_date: string
          client_id: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          end_ts: string | null
          group_id: string | null
          guest_label: string | null
          id: string
          pax_count: number | null
          promo_id: string | null
          room_number: number | null
          service_id: string
          start_time: string
          start_ts: string | null
          status: Database["public"]["Enums"]["booking_status"]
          therapist_id: string | null
        }
        Insert: {
          booking_date: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          end_ts?: string | null
          group_id?: string | null
          guest_label?: string | null
          id?: string
          pax_count?: number | null
          promo_id?: string | null
          room_number?: number | null
          service_id: string
          start_time: string
          start_ts?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          therapist_id?: string | null
        }
        Update: {
          booking_date?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          end_ts?: string | null
          group_id?: string | null
          guest_label?: string | null
          id?: string
          pax_count?: number | null
          promo_id?: string | null
          room_number?: number | null
          service_id?: string
          start_time?: string
          start_ts?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          therapist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_number_fkey"
            columns: ["room_number"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_accounts: {
        Row: {
          client_id: string
          created_at: string
          id: string
          password_hash: string
          phone: string
          username: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          password_hash: string
          phone: string
          username: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          password_hash?: string
          phone?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          birth_day: number | null
          birth_month: number | null
          codename: string
          created_at: string
          email: string | null
          id: string
          investor: boolean
          member_code: string
          password_hash: string | null
          phone: string | null
          points_balance: number
          privacy_consent: boolean
          qr_token: string
          since_date: string
          username: string
        }
        Insert: {
          birth_day?: number | null
          birth_month?: number | null
          codename: string
          created_at?: string
          email?: string | null
          id?: string
          investor?: boolean
          member_code: string
          password_hash?: string | null
          phone?: string | null
          points_balance?: number
          privacy_consent?: boolean
          qr_token?: string
          since_date?: string
          username: string
        }
        Update: {
          birth_day?: number | null
          birth_month?: number | null
          codename?: string
          created_at?: string
          email?: string | null
          id?: string
          investor?: boolean
          member_code?: string
          password_hash?: string | null
          phone?: string | null
          points_balance?: number
          privacy_consent?: boolean
          qr_token?: string
          since_date?: string
          username?: string
        }
        Relationships: []
      }
      locker_occupancy: {
        Row: {
          booking_id: string | null
          checked_in_at: string
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          client_id: string | null
          guest_label: string | null
          id: string
          locker_number: number
          room_number: number | null
          service_id: string | null
        }
        Insert: {
          booking_id?: string | null
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          client_id?: string | null
          guest_label?: string | null
          id?: string
          locker_number: number
          room_number?: number | null
          service_id?: string | null
        }
        Update: {
          booking_id?: string | null
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          client_id?: string | null
          guest_label?: string | null
          id?: string
          locker_number?: number
          room_number?: number | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locker_occupancy_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locker_occupancy_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locker_occupancy_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locker_occupancy_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locker_occupancy_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locker_occupancy_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locker_occupancy_locker_number_fkey"
            columns: ["locker_number"]
            isOneToOne: false
            referencedRelation: "lockers"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "locker_occupancy_room_number_fkey"
            columns: ["room_number"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "locker_occupancy_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      lockers: {
        Row: {
          active: boolean
          number: number
        }
        Insert: {
          active?: boolean
          number: number
        }
        Update: {
          active?: boolean
          number?: number
        }
        Relationships: []
      }
      point_transactions: {
        Row: {
          booking_id: string | null
          client_id: string
          created_at: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          idempotency_key: string | null
          notes: string | null
          points_delta: number
          processed_by: string
          sale_id: string | null
          source: Database["public"]["Enums"]["ledger_source"]
        }
        Insert: {
          booking_id?: string | null
          client_id: string
          created_at?: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          points_delta: number
          processed_by: string
          sale_id?: string | null
          source: Database["public"]["Enums"]["ledger_source"]
        }
        Update: {
          booking_id?: string | null
          client_id?: string
          created_at?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          points_delta?: number
          processed_by?: string
          sale_id?: string | null
          source?: Database["public"]["Enums"]["ledger_source"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_point_transactions_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      promos: {
        Row: {
          active: boolean
          created_at: string
          discount: number
          id: string
          label: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          discount: number
          id?: string
          label: string
        }
        Update: {
          active?: boolean
          created_at?: string
          discount?: number
          id?: string
          label?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          active: boolean
          number: number
        }
        Insert: {
          active?: boolean
          number: number
        }
        Update: {
          active?: boolean
          number?: number
        }
        Relationships: []
      }
      sale_addons: {
        Row: {
          addon_id: string
          price_at_sale: number
          sale_id: string
        }
        Insert: {
          addon_id: string
          price_at_sale: number
          sale_id: string
        }
        Update: {
          addon_id?: string
          price_at_sale?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_addons_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount: number
          booking_id: string | null
          client_id: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          guest_label: string | null
          id: string
          manual_discount_type: string | null
          manual_discount_value: number | null
          payment_method: string
          payment_ref: string | null
          processed_by: string
          promo_id: string | null
          service_id: string
          therapist_id: string | null
          voided: boolean
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          client_id?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          guest_label?: string | null
          id?: string
          manual_discount_type?: string | null
          manual_discount_value?: number | null
          payment_method: string
          payment_ref?: string | null
          processed_by: string
          promo_id?: string | null
          service_id: string
          therapist_id?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          client_id?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          guest_label?: string | null
          id?: string
          manual_discount_type?: string | null
          manual_discount_value?: number | null
          payment_method?: string
          payment_ref?: string | null
          processed_by?: string
          promo_id?: string | null
          service_id?: string
          therapist_id?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          duration_minutes: number
          id: string
          name: string
          points_earned: number
          price: number
        }
        Insert: {
          active?: boolean
          duration_minutes?: number
          id?: string
          name: string
          points_earned?: number
          price: number
        }
        Update: {
          active?: boolean
          duration_minutes?: number
          id?: string
          name?: string
          points_earned?: number
          price?: number
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          comment: string | null
          created_at: string
          id: string
          name: string
          position: Database["public"]["Enums"]["staff_position"]
          user_id: string | null
        }
        Insert: {
          active?: boolean
          comment?: string | null
          created_at?: string
          id?: string
          name: string
          position: Database["public"]["Enums"]["staff_position"]
          user_id?: string | null
        }
        Update: {
          active?: boolean
          comment?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: Database["public"]["Enums"]["staff_position"]
          user_id?: string | null
        }
        Relationships: []
      }
      therapist_absence: {
        Row: {
          absent_date: string
          created_at: string
          created_by: string | null
          id: string
          therapist_id: string
        }
        Insert: {
          absent_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          therapist_id: string
        }
        Update: {
          absent_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_absence_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_absence_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_absence_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_day_off: {
        Row: {
          therapist_id: string
          weekday: number
        }
        Insert: {
          therapist_id: string
          weekday: number
        }
        Update: {
          therapist_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "therapist_day_off_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_leave: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          reason: string | null
          start_date: string
          therapist_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          therapist_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_leave_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_leave_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_leave_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_services: {
        Row: {
          service_id: string
          therapist_id: string
        }
        Insert: {
          service_id: string
          therapist_id: string
        }
        Update: {
          service_id?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_services_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapists: {
        Row: {
          archived: boolean
          archived_at: string | null
          archived_by: string | null
          archived_reason: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapists_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "loginable_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapists_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      weekend_slots: {
        Row: {
          created_at: string
          id: string
          slot_time: string
        }
        Insert: {
          created_at?: string
          id?: string
          slot_time: string
        }
        Update: {
          created_at?: string
          id?: string
          slot_time?: string
        }
        Relationships: []
      }
    }
    Views: {
      loginable_staff: {
        Row: {
          active: boolean | null
          comment: string | null
          created_at: string | null
          id: string | null
          name: string | null
          position: Database["public"]["Enums"]["staff_position"] | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          comment?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          position?: Database["public"]["Enums"]["staff_position"] | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          comment?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          position?: Database["public"]["Enums"]["staff_position"] | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_staff_position: {
        Args: never
        Returns: Database["public"]["Enums"]["staff_position"]
      }
      is_owner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_supervisor_or_above: { Args: never; Returns: boolean }
      log_visit: {
        Args: {
          p_amount: number
          p_client_id: string
          p_is_redemption: boolean
          p_payment_method: string
          p_payment_ref?: string
          p_service_id: string
          p_staff_id: string
        }
        Returns: {
          ledger_id: string
          sale_id: string
        }[]
      }
      quick_walkin: {
        Args: {
          p_addon_ids: string[]
          p_amount: number
          p_booking_date: string
          p_client_id: string | null
          p_guest_label: string | null
          p_locker_number: number
          p_manual_discount_type: string | null
          p_manual_discount_value: number | null
          p_payment_method: string
          p_payment_ref: string | null
          p_promo_id: string | null
          p_room_number: number | null
          p_service_id: string
          p_staff_id: string
          p_start_time: string
          p_therapist_id: string | null
        }
        Returns: {
          booking_id: string
          ledger_id: string
          sale_id: string
        }[]
      }
    }
    Enums: {
      booking_status:
        | "Booked"
        | "Completed"
        | "No-show"
        | "Cancelled"
        | "Needs Reassignment"
      ledger_entry_type: "EARN" | "REDEEM" | "ADJUSTMENT"
      ledger_source: "STAFF_MANUAL" | "QR_SCAN" | "ADJUSTMENT"
      staff_position:
        | "Receptionist"
        | "Attendant"
        | "Supervisor"
        | "Owner"
        | "Others"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      booking_status: [
        "Booked",
        "Completed",
        "No-show",
        "Cancelled",
        "Needs Reassignment",
      ],
      ledger_entry_type: ["EARN", "REDEEM", "ADJUSTMENT"],
      ledger_source: ["STAFF_MANUAL", "QR_SCAN", "ADJUSTMENT"],
      staff_position: [
        "Receptionist",
        "Attendant",
        "Supervisor",
        "Owner",
        "Others",
      ],
    },
  },
} as const
