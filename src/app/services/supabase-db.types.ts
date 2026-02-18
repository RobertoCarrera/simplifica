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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          company_id: string | null
          created_at: string
          direccion: string
          id: string
          locality_id: string | null
          numero: string | null
          piso: string | null
          puerta: string | null
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          direccion: string
          id?: string
          locality_id?: string | null
          numero?: string | null
          piso?: string | null
          puerta?: string | null
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          direccion?: string
          id?: string
          locality_id?: string | null
          numero?: string | null
          piso?: string | null
          puerta?: string | null
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "addresses_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          company_id: string
          created_at: string
          feature_key: string
          id: string
          saved_seconds: number
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          feature_key: string
          id?: string
          saved_seconds?: number
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          feature_key?: string
          id?: string
          saved_seconds?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ai_usage_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      app_roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          label: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          label: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          ask_before_convert: boolean
          created_at: string
          default_auto_send_quote_email: boolean | null
          default_convert_policy: string
          default_invoice_delay_days: number
          default_irpf_enabled: boolean | null
          default_irpf_rate: number | null
          default_iva_enabled: boolean | null
          default_iva_rate: number | null
          default_payment_terms: string | null
          default_prices_include_tax: boolean | null
          enforce_globally: boolean
          id: string
          updated_at: string
        }
        Insert: {
          ask_before_convert?: boolean
          created_at?: string
          default_auto_send_quote_email?: boolean | null
          default_convert_policy?: string
          default_invoice_delay_days?: number
          default_irpf_enabled?: boolean | null
          default_irpf_rate?: number | null
          default_iva_enabled?: boolean | null
          default_iva_rate?: number | null
          default_payment_terms?: string | null
          default_prices_include_tax?: boolean | null
          enforce_globally?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          ask_before_convert?: boolean
          created_at?: string
          default_auto_send_quote_email?: boolean | null
          default_convert_policy?: string
          default_invoice_delay_days?: number
          default_irpf_enabled?: boolean | null
          default_irpf_rate?: number | null
          default_iva_enabled?: boolean | null
          default_iva_rate?: number | null
          default_payment_terms?: string | null
          default_prices_include_tax?: boolean | null
          enforce_globally?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          company_id: string
          created_at: string | null
          deleted_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          job_id: string | null
          mime_type: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          deleted_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          job_id?: string | null
          mime_type?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          deleted_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          job_id?: string | null
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          company_id: string | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      availability_exceptions: {
        Row: {
          company_id: string
          created_at: string | null
          end_time: string
          id: string
          reason: string | null
          start_time: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          end_time: string
          id?: string
          reason?: string | null
          start_time: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          end_time?: string
          id?: string
          reason?: string | null
          start_time?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "availability_exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      availability_schedules: {
        Row: {
          booking_type_id: string | null
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_unavailable: boolean | null
          start_time: string
          user_id: string
        }
        Insert: {
          booking_type_id?: string | null
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_unavailable?: boolean | null
          start_time: string
          user_id: string
        }
        Update: {
          booking_type_id?: string | null
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_unavailable?: boolean | null
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_schedules_booking_type_id_fkey"
            columns: ["booking_type_id"]
            isOneToOne: false
            referencedRelation: "booking_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_history: {
        Row: {
          booking_id: string
          change_type: string
          changed_by: string | null
          changed_by_user_id: string | null
          company_id: string
          created_at: string | null
          details: Json | null
          id: string
          new_status: string | null
          previous_status: string | null
        }
        Insert: {
          booking_id: string
          change_type: string
          changed_by?: string | null
          changed_by_user_id?: string | null
          company_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          new_status?: string | null
          previous_status?: string | null
        }
        Update: {
          booking_id?: string
          change_type?: string
          changed_by?: string | null
          changed_by_user_id?: string | null
          company_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          new_status?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "client_visible_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "booking_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      booking_types: {
        Row: {
          company_id: string
          created_at: string | null
          currency: string | null
          description: string | null
          duration: number
          id: string
          is_active: boolean | null
          name: string
          owner_id: string | null
          price: number | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration: number
          id?: string
          is_active?: boolean | null
          name: string
          owner_id?: string | null
          price?: number | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration?: number
          id?: string
          is_active?: boolean | null
          name?: string
          owner_id?: string | null
          price?: number | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "booking_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "booking_types_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_types_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_types_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_type: string | null
          booking_type_id: string
          client_id: string | null
          company_id: string
          coupon_id: string | null
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          deposit_paid: number | null
          discount_amount: number | null
          end_time: string
          form_responses: Json | null
          google_event_id: string | null
          id: string
          meeting_link: string | null
          notes: string | null
          payment_status: string | null
          professional_id: string | null
          quote_id: string | null
          resource_id: string | null
          room_id: string | null
          service_id: string | null
          start_time: string
          status: string
          total_price: number | null
          updated_at: string | null
        }
        Insert: {
          booking_type?: string | null
          booking_type_id: string
          client_id?: string | null
          company_id: string
          coupon_id?: string | null
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          deposit_paid?: number | null
          discount_amount?: number | null
          end_time: string
          form_responses?: Json | null
          google_event_id?: string | null
          id?: string
          meeting_link?: string | null
          notes?: string | null
          payment_status?: string | null
          professional_id?: string | null
          quote_id?: string | null
          resource_id?: string | null
          room_id?: string | null
          service_id?: string | null
          start_time: string
          status?: string
          total_price?: number | null
          updated_at?: string | null
        }
        Update: {
          booking_type?: string | null
          booking_type_id?: string
          client_id?: string | null
          company_id?: string
          coupon_id?: string | null
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          deposit_paid?: number | null
          discount_amount?: number | null
          end_time?: string
          form_responses?: Json | null
          google_event_id?: string | null
          id?: string
          meeting_link?: string | null
          notes?: string | null
          payment_status?: string | null
          professional_id?: string | null
          quote_id?: string | null
          resource_id?: string | null
          room_id?: string | null
          service_id?: string | null
          start_time?: string
          status?: string
          total_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_booking_type_id_fkey"
            columns: ["booking_type_id"]
            isOneToOne: false
            referencedRelation: "booking_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "bookings_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          client_id: string
          company_member_id: string
          id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          client_id: string
          company_member_id: string
          id?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          client_id?: string
          company_member_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_company_member_id_fkey"
            columns: ["company_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      client_clinical_notes: {
        Row: {
          client_id: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_clinical_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string | null
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          name: string
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          file_path: string
          file_type: string | null
          id: string
          name: string
          size: number | null
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          file_path: string
          file_type?: string | null
          id?: string
          name: string
          size?: number | null
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          file_path?: string
          file_type?: string | null
          id?: string
          name?: string
          size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "client_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_id: string | null
          client_id: string
          company_id: string
          created_at: string
          encrypted_content: string
          id: string
          key_id: string
          nonce: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          client_id: string
          company_id: string
          created_at?: string
          encrypted_content: string
          id?: string
          key_id: string
          nonce: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          client_id?: string
          company_id?: string
          created_at?: string
          encrypted_content?: string
          id?: string
          key_id?: string
          nonce?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "client_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          auth_user_id: string | null
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean
        }
        Insert: {
          auth_user_id?: string | null
          client_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean
        }
        Update: {
          auth_user_id?: string | null
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "client_portal_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "client_portal_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      client_variant_assignments: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          id: string
          service_id: string
          variant_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          service_id: string
          variant_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          service_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_variant_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_variant_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_variant_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_variant_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          access_count: number | null
          access_restrictions: Json | null
          address: Json | null
          anonymized_at: string | null
          assigned_to: string | null
          auth_user_id: string | null
          bic: string | null
          billing_email: string | null
          birth_date: string | null
          business_name: string | null
          cif_nif: string | null
          client_type: string
          company_id: string
          consent_date: string | null
          consent_ip: string | null
          consent_status: Database["public"]["Enums"]["consent_status"] | null
          created_at: string | null
          credit_limit: number | null
          currency: string | null
          data_minimization_applied: boolean | null
          data_processing_consent: boolean | null
          data_processing_consent_date: string | null
          data_processing_legal_basis: string | null
          data_retention_until: string | null
          default_discount: number | null
          deleted_at: string | null
          deletion_reason: string | null
          deletion_requested_at: string | null
          direccion_id: string | null
          dni: string | null
          email: string | null
          health_data_consent: boolean | null
          iban: string | null
          id: string
          industry: string | null
          internal_notes: string | null
          invitation_sent_at: string | null
          invitation_status:
            | Database["public"]["Enums"]["invitation_status"]
            | null
          invitation_token: string | null
          is_active: boolean | null
          is_minor: boolean | null
          language: string | null
          last_accessed_at: string | null
          last_data_review_date: string | null
          legal_representative_dni: string | null
          legal_representative_name: string | null
          marketing_consent: boolean | null
          marketing_consent_date: string | null
          marketing_consent_method: string | null
          mercantile_registry_data: Json | null
          metadata: Json | null
          name: string
          parental_consent_date: string | null
          parental_consent_verified: boolean | null
          payment_method: string | null
          payment_terms: string | null
          phone: string | null
          privacy_policy_version: string | null
          source: string | null
          status: string | null
          surname: string | null
          tags: string[] | null
          tax_region: string | null
          tier: string | null
          trade_name: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          access_count?: number | null
          access_restrictions?: Json | null
          address?: Json | null
          anonymized_at?: string | null
          assigned_to?: string | null
          auth_user_id?: string | null
          bic?: string | null
          billing_email?: string | null
          birth_date?: string | null
          business_name?: string | null
          cif_nif?: string | null
          client_type?: string
          company_id: string
          consent_date?: string | null
          consent_ip?: string | null
          consent_status?: Database["public"]["Enums"]["consent_status"] | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          data_minimization_applied?: boolean | null
          data_processing_consent?: boolean | null
          data_processing_consent_date?: string | null
          data_processing_legal_basis?: string | null
          data_retention_until?: string | null
          default_discount?: number | null
          deleted_at?: string | null
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          direccion_id?: string | null
          dni?: string | null
          email?: string | null
          health_data_consent?: boolean | null
          iban?: string | null
          id?: string
          industry?: string | null
          internal_notes?: string | null
          invitation_sent_at?: string | null
          invitation_status?:
            | Database["public"]["Enums"]["invitation_status"]
            | null
          invitation_token?: string | null
          is_active?: boolean | null
          is_minor?: boolean | null
          language?: string | null
          last_accessed_at?: string | null
          last_data_review_date?: string | null
          legal_representative_dni?: string | null
          legal_representative_name?: string | null
          marketing_consent?: boolean | null
          marketing_consent_date?: string | null
          marketing_consent_method?: string | null
          mercantile_registry_data?: Json | null
          metadata?: Json | null
          name: string
          parental_consent_date?: string | null
          parental_consent_verified?: boolean | null
          payment_method?: string | null
          payment_terms?: string | null
          phone?: string | null
          privacy_policy_version?: string | null
          source?: string | null
          status?: string | null
          surname?: string | null
          tags?: string[] | null
          tax_region?: string | null
          tier?: string | null
          trade_name?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          access_count?: number | null
          access_restrictions?: Json | null
          address?: Json | null
          anonymized_at?: string | null
          assigned_to?: string | null
          auth_user_id?: string | null
          bic?: string | null
          billing_email?: string | null
          birth_date?: string | null
          business_name?: string | null
          cif_nif?: string | null
          client_type?: string
          company_id?: string
          consent_date?: string | null
          consent_ip?: string | null
          consent_status?: Database["public"]["Enums"]["consent_status"] | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          data_minimization_applied?: boolean | null
          data_processing_consent?: boolean | null
          data_processing_consent_date?: string | null
          data_processing_legal_basis?: string | null
          data_retention_until?: string | null
          default_discount?: number | null
          deleted_at?: string | null
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          direccion_id?: string | null
          dni?: string | null
          email?: string | null
          health_data_consent?: boolean | null
          iban?: string | null
          id?: string
          industry?: string | null
          internal_notes?: string | null
          invitation_sent_at?: string | null
          invitation_status?:
            | Database["public"]["Enums"]["invitation_status"]
            | null
          invitation_token?: string | null
          is_active?: boolean | null
          is_minor?: boolean | null
          language?: string | null
          last_accessed_at?: string | null
          last_data_review_date?: string | null
          legal_representative_dni?: string | null
          legal_representative_name?: string | null
          marketing_consent?: boolean | null
          marketing_consent_date?: string | null
          marketing_consent_method?: string | null
          mercantile_registry_data?: Json | null
          metadata?: Json | null
          name?: string
          parental_consent_date?: string | null
          parental_consent_verified?: boolean | null
          payment_method?: string | null
          payment_terms?: string | null
          phone?: string | null
          privacy_policy_version?: string | null
          source?: string | null
          status?: string | null
          surname?: string | null
          tags?: string[] | null
          tax_region?: string | null
          tier?: string | null
          trade_name?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "clients_direccion_id_fkey"
            columns: ["direccion_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      clients_tags: {
        Row: {
          client_id: string
          created_at: string | null
          tag_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          tag_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "global_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          google_calendar_display_config: Json | null
          id: string
          is_active: boolean | null
          legacy_negocio_id: string | null
          logo_url: string | null
          max_users: number | null
          name: string
          nif: string | null
          settings: Json | null
          slug: string | null
          subscription_tier: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          google_calendar_display_config?: Json | null
          id?: string
          is_active?: boolean | null
          legacy_negocio_id?: string | null
          logo_url?: string | null
          max_users?: number | null
          name: string
          nif?: string | null
          settings?: Json | null
          slug?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          google_calendar_display_config?: Json | null
          id?: string
          is_active?: boolean | null
          legacy_negocio_id?: string | null
          logo_url?: string | null
          max_users?: number | null
          name?: string
          nif?: string | null
          settings?: Json | null
          slug?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      company_invitations: {
        Row: {
          company_id: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by_user_id: string
          message: string | null
          responded_at: string | null
          role: string
          status: string
          token: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by_user_id: string
          message?: string | null
          responded_at?: string | null
          role?: string
          status?: string
          token?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by_user_id?: string
          message?: string | null
          responded_at?: string | null
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "company_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "company_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      company_modules: {
        Row: {
          company_id: string
          created_at: string | null
          module_key: string
          status: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          module_key: string
          status: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          module_key?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      company_settings: {
        Row: {
          agent_module_access: Json | null
          allow_direct_contracting: boolean | null
          allow_local_payment: boolean | null
          ask_before_convert: boolean | null
          auto_send_quote_email: boolean | null
          automation: Json | null
          booking_preferences: Json | null
          company_id: string
          convert_policy: string | null
          copy_features_between_variants: boolean | null
          created_at: string
          default_invoice_delay_days: number | null
          enforce_company_defaults: boolean
          invoice_on_date: string | null
          irpf_enabled: boolean | null
          irpf_rate: number | null
          iva_enabled: boolean | null
          iva_rate: number | null
          payment_integrations: string[] | null
          payment_terms: string | null
          prices_include_tax: boolean | null
          ticket_auto_assign_on_reply: boolean | null
          ticket_client_can_close: boolean | null
          ticket_client_can_create_devices: boolean | null
          ticket_client_view_estimated_hours: boolean | null
          ticket_default_internal_comment: boolean | null
          ticket_stage_on_client_reply: string | null
          ticket_stage_on_delete: string | null
          ticket_stage_on_staff_reply: string | null
          updated_at: string
        }
        Insert: {
          agent_module_access?: Json | null
          allow_direct_contracting?: boolean | null
          allow_local_payment?: boolean | null
          ask_before_convert?: boolean | null
          auto_send_quote_email?: boolean | null
          automation?: Json | null
          booking_preferences?: Json | null
          company_id: string
          convert_policy?: string | null
          copy_features_between_variants?: boolean | null
          created_at?: string
          default_invoice_delay_days?: number | null
          enforce_company_defaults?: boolean
          invoice_on_date?: string | null
          irpf_enabled?: boolean | null
          irpf_rate?: number | null
          iva_enabled?: boolean | null
          iva_rate?: number | null
          payment_integrations?: string[] | null
          payment_terms?: string | null
          prices_include_tax?: boolean | null
          ticket_auto_assign_on_reply?: boolean | null
          ticket_client_can_close?: boolean | null
          ticket_client_can_create_devices?: boolean | null
          ticket_client_view_estimated_hours?: boolean | null
          ticket_default_internal_comment?: boolean | null
          ticket_stage_on_client_reply?: string | null
          ticket_stage_on_delete?: string | null
          ticket_stage_on_staff_reply?: string | null
          updated_at?: string
        }
        Update: {
          agent_module_access?: Json | null
          allow_direct_contracting?: boolean | null
          allow_local_payment?: boolean | null
          ask_before_convert?: boolean | null
          auto_send_quote_email?: boolean | null
          automation?: Json | null
          booking_preferences?: Json | null
          company_id?: string
          convert_policy?: string | null
          copy_features_between_variants?: boolean | null
          created_at?: string
          default_invoice_delay_days?: number | null
          enforce_company_defaults?: boolean
          invoice_on_date?: string | null
          irpf_enabled?: boolean | null
          irpf_rate?: number | null
          iva_enabled?: boolean | null
          iva_rate?: number | null
          payment_integrations?: string[] | null
          payment_terms?: string | null
          prices_include_tax?: boolean | null
          ticket_auto_assign_on_reply?: boolean | null
          ticket_client_can_close?: boolean | null
          ticket_client_can_create_devices?: boolean | null
          ticket_client_view_estimated_hours?: boolean | null
          ticket_default_internal_comment?: boolean | null
          ticket_stage_on_client_reply?: string | null
          ticket_stage_on_delete?: string | null
          ticket_stage_on_staff_reply?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "company_settings_ticket_stage_on_client_reply_fkey"
            columns: ["ticket_stage_on_client_reply"]
            isOneToOne: false
            referencedRelation: "ticket_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_ticket_stage_on_client_reply_fkey"
            columns: ["ticket_stage_on_client_reply"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_ticket_stage_on_delete_fkey"
            columns: ["ticket_stage_on_delete"]
            isOneToOne: false
            referencedRelation: "ticket_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_ticket_stage_on_delete_fkey"
            columns: ["ticket_stage_on_delete"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_ticket_stage_on_staff_reply_fkey"
            columns: ["ticket_stage_on_staff_reply"]
            isOneToOne: false
            referencedRelation: "ticket_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_ticket_stage_on_staff_reply_fkey"
            columns: ["ticket_stage_on_staff_reply"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_stage_order: {
        Row: {
          company_id: string
          created_at: string
          position: number
          stage_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          position?: number
          stage_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          position?: number
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_stage_order_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "ticket_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_stage_order_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ticket_sequences: {
        Row: {
          company_id: string
          last_val: number | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          last_val?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          last_val?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ticket_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ticket_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ticket_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_ticket_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      content_posts: {
        Row: {
          company_id: string
          content_url: string | null
          created_at: string | null
          id: string
          notes: string | null
          platform: string
          scheduled_date: string | null
          status: Database["public"]["Enums"]["content_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          content_url?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          platform: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["content_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          content_url?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          platform?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["content_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "content_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          company_id: string
          content_html: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          content_html: string
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          content_html?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contract_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_id: string
          company_id: string
          content_html: string
          created_at: string | null
          created_by: string | null
          id: string
          metadata: Json | null
          signature_data: string | null
          signed_at: string | null
          signed_pdf_url: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          company_id: string
          content_html: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          signature_data?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string
          content_html?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          signature_data?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean | null
          code: string
          company_id: string | null
          created_at: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          id: string
          start_date: string | null
          usage_count: number | null
          usage_limit: number | null
        }
        Insert: {
          active?: boolean | null
          code: string
          company_id?: string | null
          created_at?: string | null
          discount_type: string
          discount_value: number
          end_date?: string | null
          id?: string
          start_date?: string | null
          usage_count?: number | null
          usage_limit?: number | null
        }
        Update: {
          active?: boolean | null
          code?: string
          company_id?: string | null
          created_at?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: string
          start_date?: string | null
          usage_count?: number | null
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "coupons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      device_components: {
        Row: {
          component_name: string
          component_status: string
          created_at: string | null
          device_id: string
          id: string
          installed_at: string | null
          notes: string | null
          part_number: string | null
          replacement_cost: number | null
          replacement_needed: boolean | null
          supplier: string | null
          warranty_months: number | null
        }
        Insert: {
          component_name: string
          component_status: string
          created_at?: string | null
          device_id: string
          id?: string
          installed_at?: string | null
          notes?: string | null
          part_number?: string | null
          replacement_cost?: number | null
          replacement_needed?: boolean | null
          supplier?: string | null
          warranty_months?: number | null
        }
        Update: {
          component_name?: string
          component_status?: string
          created_at?: string | null
          device_id?: string
          id?: string
          installed_at?: string | null
          notes?: string | null
          part_number?: string | null
          replacement_cost?: number | null
          replacement_needed?: boolean | null
          supplier?: string | null
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "device_components_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_media: {
        Row: {
          ai_analysis: Json | null
          created_at: string | null
          description: string | null
          device_id: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          media_context: string | null
          media_type: string
          mime_type: string | null
          taken_at: string | null
          taken_by: string | null
          ticket_device_id: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          created_at?: string | null
          description?: string | null
          device_id: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          media_context?: string | null
          media_type: string
          mime_type?: string | null
          taken_at?: string | null
          taken_by?: string | null
          ticket_device_id?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          created_at?: string | null
          description?: string | null
          device_id?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          media_context?: string | null
          media_type?: string
          mime_type?: string | null
          taken_at?: string | null
          taken_by?: string | null
          ticket_device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_media_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_media_ticket_device_id_fkey"
            columns: ["ticket_device_id"]
            isOneToOne: false
            referencedRelation: "ticket_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          device_id: string
          id: string
          location: string | null
          new_status: string
          notes: string | null
          previous_status: string | null
          technician_notes: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          device_id: string
          id?: string
          location?: string | null
          new_status: string
          notes?: string | null
          previous_status?: string | null
          technician_notes?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          device_id?: string
          id?: string
          location?: string | null
          new_status?: string
          notes?: string | null
          previous_status?: string | null
          technician_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_status_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          actual_repair_time: number | null
          ai_confidence_score: number | null
          ai_diagnosis: Json | null
          brand: string
          client_id: string
          color: string | null
          company_id: string
          completed_at: string | null
          condition_on_arrival: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deletion_reason: string | null
          delivered_at: string | null
          device_images: string[] | null
          device_type: string
          estimated_cost: number | null
          estimated_repair_time: number | null
          final_cost: number | null
          id: string
          imei: string | null
          model: string
          operating_system: string | null
          priority: string | null
          purchase_date: string | null
          received_at: string | null
          repair_notes: string[] | null
          reported_issue: string
          serial_number: string | null
          started_repair_at: string | null
          status: string
          storage_capacity: string | null
          updated_at: string | null
          warranty_status: string | null
        }
        Insert: {
          actual_repair_time?: number | null
          ai_confidence_score?: number | null
          ai_diagnosis?: Json | null
          brand: string
          client_id: string
          color?: string | null
          company_id: string
          completed_at?: string | null
          condition_on_arrival?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          delivered_at?: string | null
          device_images?: string[] | null
          device_type: string
          estimated_cost?: number | null
          estimated_repair_time?: number | null
          final_cost?: number | null
          id?: string
          imei?: string | null
          model: string
          operating_system?: string | null
          priority?: string | null
          purchase_date?: string | null
          received_at?: string | null
          repair_notes?: string[] | null
          reported_issue: string
          serial_number?: string | null
          started_repair_at?: string | null
          status?: string
          storage_capacity?: string | null
          updated_at?: string | null
          warranty_status?: string | null
        }
        Update: {
          actual_repair_time?: number | null
          ai_confidence_score?: number | null
          ai_diagnosis?: Json | null
          brand?: string
          client_id?: string
          color?: string | null
          company_id?: string
          completed_at?: string | null
          condition_on_arrival?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          delivered_at?: string | null
          device_images?: string[] | null
          device_type?: string
          estimated_cost?: number | null
          estimated_repair_time?: number | null
          final_cost?: number | null
          id?: string
          imei?: string | null
          model?: string
          operating_system?: string | null
          priority?: string | null
          purchase_date?: string | null
          received_at?: string | null
          repair_notes?: string[] | null
          reported_issue?: string
          serial_number?: string | null
          started_repair_at?: string | null
          status?: string
          storage_capacity?: string | null
          updated_at?: string | null
          warranty_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_client_company_fkey"
            columns: ["client_id", "company_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      domains: {
        Row: {
          company_id: string | null
          created_at: string | null
          dkim_record: string | null
          domain: string
          id: string
          is_verified: boolean | null
          spf_record: string | null
          updated_at: string | null
          verification_record: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          dkim_record?: string | null
          domain: string
          id?: string
          is_verified?: boolean | null
          spf_record?: string | null
          updated_at?: string | null
          verification_record?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          dkim_record?: string | null
          domain?: string
          id?: string
          is_verified?: boolean | null
          spf_record?: string | null
          updated_at?: string | null
          verification_record?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      employee_commissions_config: {
        Row: {
          commission_percentage: number | null
          company_id: string
          created_at: string | null
          employee_id: string
          fixed_amount: number | null
          id: string
          service_id: string
          updated_at: string | null
        }
        Insert: {
          commission_percentage?: number | null
          company_id: string
          created_at?: string | null
          employee_id: string
          fixed_amount?: number | null
          id?: string
          service_id: string
          updated_at?: string | null
        }
        Update: {
          commission_percentage?: number | null
          company_id?: string
          created_at?: string | null
          employee_id?: string
          fixed_amount?: number | null
          id?: string
          service_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_commissions_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_commissions_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_commissions_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "employee_commissions_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "employee_commissions_config_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_commissions_config_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_commissions_config_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          company_id: string
          employee_id: string
          file_path: string
          file_type: string | null
          id: string
          name: string
          uploaded_at: string | null
        }
        Insert: {
          company_id: string
          employee_id: string
          file_path: string
          file_type?: string | null
          id?: string
          name: string
          uploaded_at?: string | null
        }
        Update: {
          company_id?: string
          employee_id?: string
          file_path?: string
          file_type?: string | null
          id?: string
          name?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "employee_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_productivity_logs: {
        Row: {
          booking_id: string | null
          calculated_commission: number
          company_id: string
          created_at: string | null
          employee_id: string
          id: string
          performed_at: string
          service_name: string
          service_price: number
        }
        Insert: {
          booking_id?: string | null
          calculated_commission?: number
          company_id: string
          created_at?: string | null
          employee_id: string
          id?: string
          performed_at?: string
          service_name: string
          service_price: number
        }
        Update: {
          booking_id?: string | null
          calculated_commission?: number
          company_id?: string
          created_at?: string | null
          employee_id?: string
          id?: string
          performed_at?: string
          service_name?: string
          service_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_productivity_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_productivity_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "client_visible_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_productivity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_productivity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_productivity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "employee_productivity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "employee_productivity_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          commission_rate: number | null
          company_id: string
          contract_type: string | null
          created_at: string | null
          hire_date: string | null
          iban: string | null
          id: string
          is_active: boolean | null
          job_title: string | null
          nif: string | null
          salary_base: number | null
          social_security_number: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          commission_rate?: number | null
          company_id: string
          contract_type?: string | null
          created_at?: string | null
          hire_date?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          nif?: string | null
          salary_base?: number | null
          social_security_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          commission_rate?: number | null
          company_id?: string
          contract_type?: string | null
          created_at?: string | null
          hire_date?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          nif?: string | null
          salary_base?: number | null
          social_security_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_access_requests: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          deadline_date: string | null
          id: string
          legal_basis_for_delay: string | null
          processing_status: string | null
          request_details: Json | null
          request_type: string
          requested_by: string | null
          response_data: Json | null
          response_file_url: string | null
          subject_email: string
          subject_identifier: string | null
          subject_name: string | null
          updated_at: string | null
          verification_method: string | null
          verification_status: string | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deadline_date?: string | null
          id?: string
          legal_basis_for_delay?: string | null
          processing_status?: string | null
          request_details?: Json | null
          request_type: string
          requested_by?: string | null
          response_data?: Json | null
          response_file_url?: string | null
          subject_email: string
          subject_identifier?: string | null
          subject_name?: string | null
          updated_at?: string | null
          verification_method?: string | null
          verification_status?: string | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deadline_date?: string | null
          id?: string
          legal_basis_for_delay?: string | null
          processing_status?: string | null
          request_details?: Json | null
          request_type?: string
          requested_by?: string | null
          response_data?: Json | null
          response_file_url?: string | null
          subject_email?: string
          subject_identifier?: string | null
          subject_name?: string | null
          updated_at?: string | null
          verification_method?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_access_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_access_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_access_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gdpr_access_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      gdpr_audit_log: {
        Row: {
          action_type: string
          company_id: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          legal_basis: string | null
          new_values: Json | null
          old_values: Json | null
          purpose: string | null
          record_id: string | null
          request_id: string | null
          session_id: string | null
          subject_email: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          legal_basis?: string | null
          new_values?: Json | null
          old_values?: Json | null
          purpose?: string | null
          record_id?: string | null
          request_id?: string | null
          session_id?: string | null
          subject_email?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          legal_basis?: string | null
          new_values?: Json | null
          old_values?: Json | null
          purpose?: string | null
          record_id?: string | null
          request_id?: string | null
          session_id?: string | null
          subject_email?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gdpr_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      gdpr_breach_incidents: {
        Row: {
          affected_data_categories: string[] | null
          breach_type: string[]
          company_id: string | null
          created_at: string | null
          data_subjects_notified: boolean | null
          discovered_at: string
          dpa_reference: string | null
          estimated_affected_subjects: number | null
          id: string
          incident_details: Json | null
          incident_reference: string
          likely_consequences: string | null
          mitigation_measures: string | null
          notification_method: string | null
          preventive_measures: string | null
          reported_at: string | null
          reported_by: string | null
          reported_to_dpa: boolean | null
          resolution_status: string | null
          resolved_at: string | null
          severity_level: string | null
          updated_at: string | null
        }
        Insert: {
          affected_data_categories?: string[] | null
          breach_type: string[]
          company_id?: string | null
          created_at?: string | null
          data_subjects_notified?: boolean | null
          discovered_at: string
          dpa_reference?: string | null
          estimated_affected_subjects?: number | null
          id?: string
          incident_details?: Json | null
          incident_reference: string
          likely_consequences?: string | null
          mitigation_measures?: string | null
          notification_method?: string | null
          preventive_measures?: string | null
          reported_at?: string | null
          reported_by?: string | null
          reported_to_dpa?: boolean | null
          resolution_status?: string | null
          resolved_at?: string | null
          severity_level?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_data_categories?: string[] | null
          breach_type?: string[]
          company_id?: string | null
          created_at?: string | null
          data_subjects_notified?: boolean | null
          discovered_at?: string
          dpa_reference?: string | null
          estimated_affected_subjects?: number | null
          id?: string
          incident_details?: Json | null
          incident_reference?: string
          likely_consequences?: string | null
          mitigation_measures?: string | null
          notification_method?: string | null
          preventive_measures?: string | null
          reported_at?: string | null
          reported_by?: string | null
          reported_to_dpa?: boolean | null
          resolution_status?: string | null
          resolved_at?: string | null
          severity_level?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_breach_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_breach_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_breach_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gdpr_breach_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      gdpr_consent_records: {
        Row: {
          company_id: string | null
          consent_evidence: Json | null
          consent_given: boolean
          consent_method: string
          consent_type: string
          created_at: string | null
          data_processing_purposes: string[] | null
          id: string
          is_active: boolean | null
          legal_basis: string | null
          processed_by: string | null
          purpose: string
          retention_period: unknown
          subject_email: string
          subject_id: string | null
          updated_at: string | null
          withdrawal_evidence: Json | null
          withdrawal_method: string | null
          withdrawn_at: string | null
        }
        Insert: {
          company_id?: string | null
          consent_evidence?: Json | null
          consent_given: boolean
          consent_method: string
          consent_type: string
          created_at?: string | null
          data_processing_purposes?: string[] | null
          id?: string
          is_active?: boolean | null
          legal_basis?: string | null
          processed_by?: string | null
          purpose: string
          retention_period?: unknown
          subject_email: string
          subject_id?: string | null
          updated_at?: string | null
          withdrawal_evidence?: Json | null
          withdrawal_method?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          company_id?: string | null
          consent_evidence?: Json | null
          consent_given?: boolean
          consent_method?: string
          consent_type?: string
          created_at?: string | null
          data_processing_purposes?: string[] | null
          id?: string
          is_active?: boolean | null
          legal_basis?: string | null
          processed_by?: string | null
          purpose?: string
          retention_period?: unknown
          subject_email?: string
          subject_id?: string | null
          updated_at?: string | null
          withdrawal_evidence?: Json | null
          withdrawal_method?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_consent_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_consent_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_consent_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gdpr_consent_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      gdpr_consent_requests: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          company_id: string
          consent_types: string[]
          created_at: string | null
          evidence: Json | null
          expires_at: string | null
          id: string
          purpose: string | null
          status: string
          subject_email: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          company_id: string
          consent_types: string[]
          created_at?: string | null
          evidence?: Json | null
          expires_at?: string | null
          id?: string
          purpose?: string | null
          status?: string
          subject_email: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          company_id?: string
          consent_types?: string[]
          created_at?: string | null
          evidence?: Json | null
          expires_at?: string | null
          id?: string
          purpose?: string | null
          status?: string
          subject_email?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_consent_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_consent_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_consent_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_consent_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gdpr_consent_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      gdpr_processing_activities: {
        Row: {
          activity_name: string
          company_id: string | null
          created_at: string | null
          cross_border_transfers: Json | null
          data_categories: string[]
          data_subjects: string[]
          dpo_assessment: string | null
          id: string
          is_active: boolean | null
          legal_basis: string
          purpose: string
          recipients: string[] | null
          retention_period: unknown
          security_measures: Json | null
          updated_at: string | null
        }
        Insert: {
          activity_name: string
          company_id?: string | null
          created_at?: string | null
          cross_border_transfers?: Json | null
          data_categories: string[]
          data_subjects: string[]
          dpo_assessment?: string | null
          id?: string
          is_active?: boolean | null
          legal_basis: string
          purpose: string
          recipients?: string[] | null
          retention_period?: unknown
          security_measures?: Json | null
          updated_at?: string | null
        }
        Update: {
          activity_name?: string
          company_id?: string | null
          created_at?: string | null
          cross_border_transfers?: Json | null
          data_categories?: string[]
          data_subjects?: string[]
          dpo_assessment?: string | null
          id?: string
          is_active?: boolean | null
          legal_basis?: string
          purpose?: string
          recipients?: string[] | null
          retention_period?: unknown
          security_measures?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_processing_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_processing_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_processing_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gdpr_processing_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      global_tags: {
        Row: {
          category: string | null
          category_color: string | null
          color: string
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          scope: string[] | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          category_color?: string | null
          color: string
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          scope?: string[] | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          category_color?: string | null
          color?: string
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          scope?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      google_calendar_configs: {
        Row: {
          calendar_id: string | null
          calendar_id_booking: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_id?: string | null
          calendar_id_booking?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_id?: string | null
          calendar_id_booking?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hidden_stages: {
        Row: {
          company_id: string
          hidden_at: string
          hidden_by: string | null
          id: string
          stage_id: string
        }
        Insert: {
          company_id: string
          hidden_at?: string
          hidden_by?: string | null
          id?: string
          stage_id: string
        }
        Update: {
          company_id?: string
          hidden_at?: string
          hidden_by?: string | null
          id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "hidden_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "hidden_stages_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_stages_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_stages_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "ticket_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_units: {
        Row: {
          company_id: string
          created_at: string
          hidden_by: string
          unit_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          hidden_by: string
          unit_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          hidden_by?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "hidden_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "hidden_units_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_units_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_units_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "service_units"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string
          company_id: string | null
          created_at: string | null
          expires_at: string
          id: string
          metadata: Json | null
          provider: string
          provider_email: string | null
          refresh_token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          company_id?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          metadata?: Json | null
          provider: string
          provider_email?: string | null
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          company_id?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          metadata?: Json | null
          provider?: string
          provider_email?: string | null
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string | null
          description: string
          discount_percent: number
          id: string
          invoice_id: string
          line_order: number
          product_id: string | null
          quantity: number
          service_id: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          discount_percent?: number
          id?: string
          invoice_id: string
          line_order?: number
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          subtotal: number
          tax_amount: number
          tax_rate?: number
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          description?: string
          discount_percent?: number
          id?: string
          invoice_id?: string
          line_order?: number
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_meta: {
        Row: {
          created_at: string
          invoice_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          invoice_id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          invoice_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_series: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          is_default: boolean
          last_verifactu_hash: string | null
          next_number: number
          prefix: string
          series_code: string
          series_name: string
          updated_at: string | null
          verifactu_enabled: boolean
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_verifactu_hash?: string | null
          next_number?: number
          prefix: string
          series_code: string
          series_name: string
          updated_at?: string | null
          verifactu_enabled?: boolean
          year?: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_verifactu_hash?: string | null
          next_number?: number
          prefix?: string
          series_code?: string
          series_name?: string
          updated_at?: string | null
          verifactu_enabled?: boolean
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoice_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "invoice_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          css_styles: string | null
          description: string | null
          html_template: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          show_company_logo: boolean
          show_payment_info: boolean
          show_tax_breakdown: boolean
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          css_styles?: string | null
          description?: string | null
          html_template: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          show_company_logo?: boolean
          show_payment_info?: boolean
          show_tax_breakdown?: boolean
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          css_styles?: string | null
          description?: string | null
          html_template?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          show_company_logo?: boolean
          show_payment_info?: boolean
          show_tax_breakdown?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoice_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "invoice_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          anonymized_at: string | null
          canonical_payload: Json | null
          client_id: string
          company_id: string
          created_at: string | null
          created_by: string | null
          currency: string
          deleted_at: string | null
          due_date: string
          finalized_at: string | null
          full_invoice_number: string | null
          gdpr_legal_basis: string
          hash_current: string | null
          hash_prev: string | null
          id: string
          internal_notes: string | null
          invoice_date: string
          invoice_month: string | null
          invoice_number: string
          invoice_series: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          lead_id: string | null
          notes: string | null
          paid_amount: number
          payment_date: string | null
          payment_link_expires_at: string | null
          payment_link_provider: string | null
          payment_link_token: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          payment_status: string | null
          paypal_payment_token: string | null
          paypal_payment_url: string | null
          rectification_reason: string | null
          rectifies_invoice_id: string | null
          recurrence_period: string | null
          retention_until: string | null
          series_id: string
          source_quote_id: string | null
          state: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_token: string | null
          stripe_payment_url: string | null
          subtotal: number
          tax_amount: number
          total: number
          total_gross: number | null
          total_tax_base: number | null
          total_vat: number | null
          updated_at: string | null
          verifactu_chain_position: number | null
          verifactu_hash: string | null
          verifactu_qr_code: string | null
          verifactu_signature: string | null
          verifactu_timestamp: string | null
          verifactu_xml: string | null
        }
        Insert: {
          anonymized_at?: string | null
          canonical_payload?: Json | null
          client_id: string
          company_id: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date: string
          finalized_at?: string | null
          full_invoice_number?: string | null
          gdpr_legal_basis?: string
          hash_current?: string | null
          hash_prev?: string | null
          id?: string
          internal_notes?: string | null
          invoice_date?: string
          invoice_month?: string | null
          invoice_number: string
          invoice_series: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          lead_id?: string | null
          notes?: string | null
          paid_amount?: number
          payment_date?: string | null
          payment_link_expires_at?: string | null
          payment_link_provider?: string | null
          payment_link_token?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: string | null
          paypal_payment_token?: string | null
          paypal_payment_url?: string | null
          rectification_reason?: string | null
          rectifies_invoice_id?: string | null
          recurrence_period?: string | null
          retention_until?: string | null
          series_id: string
          source_quote_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_token?: string | null
          stripe_payment_url?: string | null
          subtotal?: number
          tax_amount?: number
          total?: number
          total_gross?: number | null
          total_tax_base?: number | null
          total_vat?: number | null
          updated_at?: string | null
          verifactu_chain_position?: number | null
          verifactu_hash?: string | null
          verifactu_qr_code?: string | null
          verifactu_signature?: string | null
          verifactu_timestamp?: string | null
          verifactu_xml?: string | null
        }
        Update: {
          anonymized_at?: string | null
          canonical_payload?: Json | null
          client_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string
          finalized_at?: string | null
          full_invoice_number?: string | null
          gdpr_legal_basis?: string
          hash_current?: string | null
          hash_prev?: string | null
          id?: string
          internal_notes?: string | null
          invoice_date?: string
          invoice_month?: string | null
          invoice_number?: string
          invoice_series?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          lead_id?: string | null
          notes?: string | null
          paid_amount?: number
          payment_date?: string | null
          payment_link_expires_at?: string | null
          payment_link_provider?: string | null
          payment_link_token?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: string | null
          paypal_payment_token?: string | null
          paypal_payment_url?: string | null
          rectification_reason?: string | null
          rectifies_invoice_id?: string | null
          recurrence_period?: string | null
          retention_until?: string | null
          series_id?: string
          source_quote_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_token?: string | null
          stripe_payment_url?: string | null
          subtotal?: number
          tax_amount?: number
          total?: number
          total_gross?: number | null
          total_tax_base?: number | null
          total_vat?: number | null
          updated_at?: string | null
          verifactu_chain_position?: number | null
          verifactu_hash?: string | null
          verifactu_qr_code?: string | null
          verifactu_signature?: string | null
          verifactu_timestamp?: string | null
          verifactu_xml?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_rectifies_invoice_id_fkey"
            columns: ["rectifies_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "invoice_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "invoiceseries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      item_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          record_id: string
          record_type: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          record_id: string
          record_type: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          record_id?: string
          record_type?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "global_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      job_notes: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          job_id: string
          note: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          job_id: string
          note: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          job_id?: string
          note?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "job_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "job_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interactions: {
        Row: {
          created_at: string | null
          id: string
          lead_id: string
          summary: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          lead_id: string
          summary?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          lead_id?: string
          summary?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "lead_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      leads: {
        Row: {
          account_id: string | null
          assigned_to: string | null
          company_id: string
          created_at: string | null
          email: string | null
          first_name: string | null
          gdpr_accepted: boolean | null
          gdpr_consent_sent_at: string | null
          id: string
          interest: string | null
          last_name: string | null
          lead_source_id: string | null
          metadata: Json | null
          notes: string | null
          phone: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          assigned_to?: string | null
          company_id: string
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gdpr_accepted?: boolean | null
          gdpr_consent_sent_at?: string | null
          id?: string
          interest?: string | null
          last_name?: string | null
          lead_source_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          assigned_to?: string | null
          company_id?: string
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gdpr_accepted?: boolean | null
          gdpr_consent_sent_at?: string | null
          id?: string
          interest?: string | null
          last_name?: string | null
          lead_source_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mail_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "leads_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      localities: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          postal_code: string | null
          province: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          postal_code?: string | null
          province?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          postal_code?: string | null
          province?: string | null
        }
        Relationships: []
      }
      loyalty_points: {
        Row: {
          booking_id: string | null
          company_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          points: number
          reason: string
          source: string | null
        }
        Insert: {
          booking_id?: string | null
          company_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          points: number
          reason: string
          source?: string | null
        }
        Update: {
          booking_id?: string | null
          company_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          points?: number
          reason?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "client_visible_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_client_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "loyalty_points_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      mail_accounts: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          provider: string
          sender_name: string | null
          settings: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          provider: string
          sender_name?: string | null
          settings?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          provider?: string
          sender_name?: string | null
          settings?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_attachments: {
        Row: {
          content_type: string | null
          created_at: string | null
          filename: string
          id: string
          message_id: string
          size: number | null
          storage_path: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          filename: string
          id?: string
          message_id: string
          size?: number | null
          storage_path?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          filename?: string
          id?: string
          message_id?: string
          size?: number | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "mail_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_contacts: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string | null
          phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_folders: {
        Row: {
          account_id: string
          created_at: string | null
          id: string
          name: string
          parent_id: string | null
          path: string
          system_role: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
          path: string
          system_role?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          path?: string
          system_role?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_folders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mail_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mail_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_messages: {
        Row: {
          account_id: string
          bcc: Json[] | null
          body_html: string | null
          body_text: string | null
          cc: Json[] | null
          created_at: string | null
          folder_id: string | null
          from: Json | null
          id: string
          is_archived: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          metadata: Json | null
          received_at: string | null
          snippet: string | null
          subject: string | null
          thread_id: string | null
          to: Json[] | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          bcc?: Json[] | null
          body_html?: string | null
          body_text?: string | null
          cc?: Json[] | null
          created_at?: string | null
          folder_id?: string | null
          from?: Json | null
          id?: string
          is_archived?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          metadata?: Json | null
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to?: Json[] | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          bcc?: Json[] | null
          body_html?: string | null
          body_text?: string | null
          cc?: Json[] | null
          created_at?: string | null
          folder_id?: string | null
          from?: Json | null
          id?: string
          is_archived?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          metadata?: Json | null
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to?: Json[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mail_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_messages_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "mail_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "mail_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_threads: {
        Row: {
          account_id: string
          created_at: string | null
          id: string
          last_message_at: string | null
          snippet: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          snippet?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          snippet?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_threads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mail_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          company_id: string
          config: Json | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          subject: string | null
          target_audience: Json | null
          trigger_type:
            | Database["public"]["Enums"]["campaign_trigger_type"]
            | null
          type: Database["public"]["Enums"]["campaign_type"]
        }
        Insert: {
          company_id: string
          config?: Json | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          subject?: string | null
          target_audience?: Json | null
          trigger_type?:
            | Database["public"]["Enums"]["campaign_trigger_type"]
            | null
          type?: Database["public"]["Enums"]["campaign_type"]
        }
        Update: {
          company_id?: string
          config?: Json | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          subject?: string | null
          target_audience?: Json | null
          trigger_type?:
            | Database["public"]["Enums"]["campaign_trigger_type"]
            | null
          type?: Database["public"]["Enums"]["campaign_type"]
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "marketing_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      marketing_logs: {
        Row: {
          campaign_id: string | null
          channel: Database["public"]["Enums"]["campaign_type"]
          client_id: string | null
          id: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          channel: Database["public"]["Enums"]["campaign_type"]
          client_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["campaign_type"]
          client_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_metrics: {
        Row: {
          channel: string
          clicks: number | null
          company_id: string
          created_at: string | null
          date: string
          id: string
          impressions: number | null
          leads_attributed: number | null
          spend: number | null
          updated_at: string | null
        }
        Insert: {
          channel: string
          clicks?: number | null
          company_id: string
          created_at?: string | null
          date: string
          id?: string
          impressions?: number | null
          leads_attributed?: number | null
          spend?: number | null
          updated_at?: string | null
        }
        Update: {
          channel?: string
          clicks?: number | null
          company_id?: string
          created_at?: string | null
          date?: string
          id?: string
          impressions?: number | null
          leads_attributed?: number | null
          spend?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "marketing_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string | null
          description: string | null
          enabled_by_default: boolean | null
          is_active: boolean | null
          key: string
          name: string
          position: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          enabled_by_default?: boolean | null
          is_active?: boolean | null
          key: string
          name: string
          position?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          enabled_by_default?: boolean | null
          is_active?: boolean | null
          key?: string
          name?: string
          position?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      modules_catalog: {
        Row: {
          created_at: string | null
          key: string
          label: string
        }
        Insert: {
          created_at?: string | null
          key: string
          label: string
        }
        Update: {
          created_at?: string | null
          key?: string
          label?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          booking_id: string | null
          channel: string
          company_id: string | null
          error_message: string | null
          id: string
          recipient: string
          sent_at: string | null
          status: string
          template_id: string | null
        }
        Insert: {
          booking_id?: string | null
          channel: string
          company_id?: string | null
          error_message?: string | null
          id?: string
          recipient: string
          sent_at?: string | null
          status: string
          template_id?: string | null
        }
        Update: {
          booking_id?: string | null
          channel?: string
          company_id?: string | null
          error_message?: string | null
          id?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "client_visible_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "notification_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "notification_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          active: boolean | null
          body: string
          company_id: string | null
          created_at: string | null
          id: string
          name: string
          subject: string | null
          trigger_event: string
          type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          body: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          subject?: string | null
          trigger_event: string
          type: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          body?: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          subject?: string | null
          trigger_event?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      notifications: {
        Row: {
          client_recipient_id: string | null
          company_id: string
          content: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          metadata: Json | null
          recipient_id: string | null
          reference_id: string
          title: string
          type: string
        }
        Insert: {
          client_recipient_id?: string | null
          company_id: string
          content?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          recipient_id?: string | null
          reference_id: string
          title: string
          type: string
        }
        Update: {
          client_recipient_id?: string | null
          company_id?: string
          content?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          recipient_id?: string | null
          reference_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_recipient_id_fkey"
            columns: ["client_recipient_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_integrations: {
        Row: {
          company_id: string
          created_at: string
          credentials_encrypted: string
          id: string
          is_active: boolean
          is_sandbox: boolean
          last_verified_at: string | null
          provider: string
          updated_at: string
          verification_status: string | null
          webhook_secret_encrypted: string | null
          webhook_url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          credentials_encrypted: string
          id?: string
          is_active?: boolean
          is_sandbox?: boolean
          last_verified_at?: string | null
          provider: string
          updated_at?: string
          verification_status?: string | null
          webhook_secret_encrypted?: string | null
          webhook_url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          credentials_encrypted?: string
          id?: string
          is_active?: boolean
          is_sandbox?: boolean
          last_verified_at?: string | null
          provider?: string
          updated_at?: string
          verification_status?: string | null
          webhook_secret_encrypted?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payment_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          currency: string
          external_id: string | null
          id: string
          invoice_id: string
          provider: string
          provider_response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          invoice_id: string
          provider: string
          provider_response?: Json | null
          status: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          invoice_id?: string
          provider?: string
          provider_response?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payment_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "payment_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_users: {
        Row: {
          auth_user_id: string | null
          company_id: string | null
          company_name: string | null
          company_nif: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          full_name: string
          given_name: string | null
          id: string
          surname: string | null
        }
        Insert: {
          auth_user_id?: string | null
          company_id?: string | null
          company_name?: string | null
          company_nif?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          full_name: string
          given_name?: string | null
          id?: string
          surname?: string | null
        }
        Update: {
          auth_user_id?: string | null
          company_id?: string | null
          company_name?: string | null
          company_nif?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          full_name?: string
          given_name?: string | null
          id?: string
          surname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "pending_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      product_brands: {
        Row: {
          company_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_brands_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_brands_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_brands_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "product_brands_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      product_catalog: {
        Row: {
          brand: string | null
          category: string | null
          company_id: string | null
          compatibility: Json | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          ean: string | null
          embedding: string | null
          id: string
          image_url: string | null
          model: string | null
          name: string
          search_vector: unknown
          sku: string | null
          source: string | null
          specs: Json | null
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          company_id?: string | null
          compatibility?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          ean?: string | null
          embedding?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          name: string
          search_vector?: unknown
          sku?: string | null
          source?: string | null
          specs?: Json | null
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          company_id?: string | null
          compatibility?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          ean?: string | null
          embedding?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          name?: string
          search_vector?: unknown
          sku?: string | null
          source?: string | null
          specs?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_catalog_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_catalog_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_catalog_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "product_catalog_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      product_categories: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_models: {
        Row: {
          brand_id: string
          company_id: string
          created_at: string | null
          deleted_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          brand_id: string
          company_id: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string
          company_id?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_models_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "product_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_models_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_models_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_models_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "product_models_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          brand_id: string | null
          catalog_product_id: string | null
          category_id: string | null
          company_id: string
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: string
          location: string | null
          min_stock_level: number | null
          model: string | null
          name: string
          price: number | null
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          brand_id?: string | null
          catalog_product_id?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          min_stock_level?: number | null
          model?: string | null
          name: string
          price?: number | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          brand_id?: string | null
          catalog_product_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          min_stock_level?: number | null
          model?: string | null
          name?: string
          price?: number | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "product_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      professional_services: {
        Row: {
          created_at: string | null
          id: string
          professional_id: string
          service_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          professional_id: string
          service_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company_id: string
          created_at: string | null
          display_name: string
          email: string | null
          id: string
          is_active: boolean | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company_id: string
          created_at?: string | null
          display_name: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company_id?: string
          created_at?: string | null
          display_name?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "professionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "professionals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity: {
        Row: {
          activity_type: string
          client_id: string | null
          company_id: string
          created_at: string | null
          details: Json | null
          id: string
          project_id: string
          user_id: string | null
        }
        Insert: {
          activity_type: string
          client_id?: string | null
          company_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          project_id: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          client_id?: string | null
          company_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "project_activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      project_comments: {
        Row: {
          client_id: string | null
          content: string
          created_at: string | null
          id: string
          project_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          project_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          project_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string
          file_type: string | null
          id: string
          is_folder: boolean | null
          name: string
          parent_id: string | null
          project_id: string
          size: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path: string
          file_type?: string | null
          id?: string
          is_folder?: boolean | null
          name: string
          parent_id?: string | null
          project_id: string
          size?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string
          file_type?: string | null
          id?: string
          is_folder?: boolean | null
          name?: string
          parent_id?: string | null
          project_id?: string
          size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_files_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notification_preferences: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          notify_on_deadline_approaching: boolean | null
          notify_on_new_comment: boolean | null
          notify_on_new_task: boolean | null
          notify_on_project_update: boolean | null
          notify_on_task_assigned: boolean | null
          notify_on_task_completed: boolean | null
          project_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          notify_on_deadline_approaching?: boolean | null
          notify_on_new_comment?: boolean | null
          notify_on_new_task?: boolean | null
          notify_on_project_update?: boolean | null
          notify_on_task_assigned?: boolean | null
          notify_on_task_completed?: boolean | null
          project_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          notify_on_deadline_approaching?: boolean | null
          notify_on_new_comment?: boolean | null
          notify_on_new_task?: boolean | null
          notify_on_project_update?: boolean | null
          notify_on_task_assigned?: boolean | null
          notify_on_task_completed?: boolean | null
          project_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_notification_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notification_preferences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_permissions: {
        Row: {
          client_can_assign_tasks: boolean | null
          client_can_comment: boolean | null
          client_can_complete_tasks: boolean | null
          client_can_create_tasks: boolean | null
          client_can_delete_tasks: boolean | null
          client_can_edit_project: boolean | null
          client_can_edit_tasks: boolean | null
          client_can_move_stage: boolean | null
          client_can_view_all_comments: boolean | null
          created_at: string | null
          id: string
          project_id: string
          updated_at: string | null
        }
        Insert: {
          client_can_assign_tasks?: boolean | null
          client_can_comment?: boolean | null
          client_can_complete_tasks?: boolean | null
          client_can_create_tasks?: boolean | null
          client_can_delete_tasks?: boolean | null
          client_can_edit_project?: boolean | null
          client_can_edit_tasks?: boolean | null
          client_can_move_stage?: boolean | null
          client_can_view_all_comments?: boolean | null
          created_at?: string | null
          id?: string
          project_id: string
          updated_at?: string | null
        }
        Update: {
          client_can_assign_tasks?: boolean | null
          client_can_comment?: boolean | null
          client_can_complete_tasks?: boolean | null
          client_can_create_tasks?: boolean | null
          client_can_delete_tasks?: boolean | null
          client_can_edit_project?: boolean | null
          client_can_edit_tasks?: boolean | null
          client_can_move_stage?: boolean | null
          client_can_view_all_comments?: boolean | null
          created_at?: string | null
          id?: string
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_reads: {
        Row: {
          client_id: string | null
          last_read_at: string | null
          project_id: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          last_read_at?: string | null
          project_id: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          last_read_at?: string | null
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_reads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stages: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean | null
          is_final: boolean | null
          is_landing: boolean | null
          is_review: boolean | null
          name: string
          position: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_final?: boolean | null
          is_landing?: boolean | null
          is_review?: boolean | null
          name: string
          position?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_final?: boolean | null
          is_landing?: boolean | null
          is_review?: boolean | null
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "project_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          due_date: string | null
          id: string
          is_completed: boolean | null
          position: number | null
          project_id: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          position?: number | null
          project_id: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          position?: number | null
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          company_id: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_archived: boolean | null
          is_internal_archived: boolean | null
          name: string
          permissions: Json | null
          position: number | null
          priority: string | null
          stage_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_archived?: boolean | null
          is_internal_archived?: boolean | null
          name: string
          permissions?: Json | null
          position?: number | null
          priority?: string | null
          stage_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_archived?: boolean | null
          is_internal_archived?: boolean | null
          name?: string
          permissions?: Json | null
          position?: number | null
          priority?: string | null
          stage_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "projects_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          billing_period: string | null
          company_id: string
          created_at: string | null
          description: string
          discount_amount: number | null
          discount_percent: number | null
          id: string
          line_number: number
          notes: string | null
          product_id: string | null
          quantity: number
          quote_id: string
          service_id: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          unit_price: number
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          billing_period?: string | null
          company_id: string
          created_at?: string | null
          description: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          line_number: number
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id: string
          service_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          unit_price: number
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          billing_period?: string | null
          company_id?: string
          created_at?: string | null
          description?: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          line_number?: number
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          service_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          unit_price?: number
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quote_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          default_items: Json | null
          default_tax_rate: number | null
          default_valid_days: number | null
          description: string | null
          description_template: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          notes_template: string | null
          terms_conditions_template: string | null
          title_template: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          default_items?: Json | null
          default_tax_rate?: number | null
          default_valid_days?: number | null
          description?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name: string
          notes_template?: string | null
          terms_conditions_template?: string | null
          title_template?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          default_items?: Json | null
          default_tax_rate?: number | null
          default_valid_days?: number | null
          description?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          notes_template?: string | null
          terms_conditions_template?: string | null
          title_template?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quote_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          anonymized_at: string | null
          booking_id: string | null
          client_id: string
          client_ip_address: unknown
          client_user_agent: string | null
          client_viewed_at: string | null
          company_id: string
          conversion_status: string
          convert_policy: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deposit_percentage: number | null
          description: string | null
          digital_signature: string | null
          discount_amount: number | null
          discount_percent: number | null
          full_quote_number: string | null
          id: string
          invoice_id: string | null
          invoice_on_date: string | null
          invoiced_at: string | null
          is_anonymized: boolean | null
          language: string | null
          last_run_at: string | null
          next_run_at: string | null
          notes: string | null
          pdf_generated_at: string | null
          pdf_url: string | null
          quote_date: string
          quote_month: string | null
          quote_number: string
          rectification_reason: string | null
          rectifies_invoice_id: string | null
          recurrence_day: number | null
          recurrence_end_date: string | null
          recurrence_interval: number
          recurrence_start_date: string | null
          recurrence_type: string
          rejected_at: string | null
          rejection_reason: string | null
          retention_until: string | null
          scheduled_conversion_date: string | null
          sequence_number: number
          signature_timestamp: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_amount: number
          terms_conditions: string | null
          ticket_id: string | null
          title: string
          total_amount: number
          updated_at: string | null
          valid_until: string
          year: number
        }
        Insert: {
          accepted_at?: string | null
          anonymized_at?: string | null
          booking_id?: string | null
          client_id: string
          client_ip_address?: unknown
          client_user_agent?: string | null
          client_viewed_at?: string | null
          company_id: string
          conversion_status?: string
          convert_policy?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deposit_percentage?: number | null
          description?: string | null
          digital_signature?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          full_quote_number?: string | null
          id?: string
          invoice_id?: string | null
          invoice_on_date?: string | null
          invoiced_at?: string | null
          is_anonymized?: boolean | null
          language?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          notes?: string | null
          pdf_generated_at?: string | null
          pdf_url?: string | null
          quote_date?: string
          quote_month?: string | null
          quote_number: string
          rectification_reason?: string | null
          rectifies_invoice_id?: string | null
          recurrence_day?: number | null
          recurrence_end_date?: string | null
          recurrence_interval?: number
          recurrence_start_date?: string | null
          recurrence_type?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          retention_until?: string | null
          scheduled_conversion_date?: string | null
          sequence_number: number
          signature_timestamp?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          terms_conditions?: string | null
          ticket_id?: string | null
          title: string
          total_amount?: number
          updated_at?: string | null
          valid_until: string
          year?: number
        }
        Update: {
          accepted_at?: string | null
          anonymized_at?: string | null
          booking_id?: string | null
          client_id?: string
          client_ip_address?: unknown
          client_user_agent?: string | null
          client_viewed_at?: string | null
          company_id?: string
          conversion_status?: string
          convert_policy?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deposit_percentage?: number | null
          description?: string | null
          digital_signature?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          full_quote_number?: string | null
          id?: string
          invoice_id?: string | null
          invoice_on_date?: string | null
          invoiced_at?: string | null
          is_anonymized?: boolean | null
          language?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          notes?: string | null
          pdf_generated_at?: string | null
          pdf_url?: string | null
          quote_date?: string
          quote_month?: string | null
          quote_number?: string
          rectification_reason?: string | null
          rectifies_invoice_id?: string | null
          recurrence_day?: number | null
          recurrence_end_date?: string | null
          recurrence_interval?: number
          recurrence_start_date?: string | null
          recurrence_type?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          retention_until?: string | null
          scheduled_conversion_date?: string | null
          sequence_number?: number
          signature_timestamp?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          terms_conditions?: string | null
          ticket_id?: string | null
          title?: string
          total_amount?: number
          updated_at?: string | null
          valid_until?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "client_visible_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "quotes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_rectifies_invoice_id_fkey"
            columns: ["rectifies_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          capacity: number | null
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          capacity?: number | null
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          capacity?: number | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "resources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          company_id: string | null
          created_at: string | null
          granted: boolean | null
          id: string
          permission: string
          role: string
          role_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          granted?: boolean | null
          id?: string
          permission: string
          role: string
          role_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          granted?: boolean | null
          id?: string
          permission?: string
          role?: string
          role_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          capacity?: number
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          capacity?: number
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "rooms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          created_at: string
          executed_at: string | null
          id: string
          job_type: string
          last_error: string | null
          payload: Json
          retry_count: number
          scheduled_at: string
          status: string
        }
        Insert: {
          created_at?: string
          executed_at?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          payload: Json
          retry_count?: number
          scheduled_at: string
          status?: string
        }
        Update: {
          created_at?: string
          executed_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          payload?: Json
          retry_count?: number
          scheduled_at?: string
          status?: string
        }
        Relationships: []
      }
      scheduled_notifications: {
        Row: {
          booking_id: string
          created_at: string | null
          error: string | null
          id: string
          scheduled_for: string
          sent_at: string | null
          status: string
          type: string
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          error?: string | null
          id?: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          type: string
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          error?: string | null
          id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "client_visible_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "service_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      service_units: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "service_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      service_variants: {
        Row: {
          cost_price: number | null
          created_at: string | null
          discount_percentage: number | null
          display_config: Json | null
          estimated_hours: number | null
          features: Json | null
          id: string
          is_active: boolean | null
          is_hidden: boolean | null
          pricing: Json | null
          profit_margin: number | null
          service_id: string
          sort_order: number | null
          updated_at: string | null
          variant_name: string
        }
        Insert: {
          cost_price?: number | null
          created_at?: string | null
          discount_percentage?: number | null
          display_config?: Json | null
          estimated_hours?: number | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_hidden?: boolean | null
          pricing?: Json | null
          profit_margin?: number | null
          service_id: string
          sort_order?: number | null
          updated_at?: string | null
          variant_name: string
        }
        Update: {
          cost_price?: number | null
          created_at?: string | null
          discount_percentage?: number | null
          display_config?: Json | null
          estimated_hours?: number | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_hidden?: boolean | null
          pricing?: Json | null
          profit_margin?: number | null
          service_id?: string
          sort_order?: number | null
          updated_at?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_variants_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_variants_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          allow_direct_contracting: boolean | null
          base_features: Json | null
          base_price: number | null
          booking_color: string | null
          buffer_minutes: number | null
          can_be_remote: boolean | null
          category: string | null
          company_id: string
          cost_price: number | null
          created_at: string | null
          deleted_at: string | null
          deposit_amount: number | null
          deposit_type: string | null
          description: string | null
          difficulty_level: number | null
          duration_minutes: number | null
          estimated_hours: number | null
          features: string | null
          form_schema: Json | null
          has_variants: boolean | null
          id: string
          is_active: boolean
          is_bookable: boolean | null
          is_public: boolean | null
          legacy_negocio_id: string | null
          max_capacity: number | null
          max_lead_days: number | null
          max_quantity: number | null
          min_notice_minutes: number | null
          min_quantity: number | null
          name: string
          price_variations: Json | null
          priority_level: number | null
          profit_margin: number | null
          required_resource_type: string | null
          requires_confirmation: boolean | null
          requires_diagnosis: boolean | null
          requires_parts: boolean | null
          room_required: boolean | null
          skill_requirements: string[] | null
          tax_rate: number | null
          tools_required: string[] | null
          unit_type: string | null
          updated_at: string | null
          warranty_days: number | null
        }
        Insert: {
          allow_direct_contracting?: boolean | null
          base_features?: Json | null
          base_price?: number | null
          booking_color?: string | null
          buffer_minutes?: number | null
          can_be_remote?: boolean | null
          category?: string | null
          company_id: string
          cost_price?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deposit_amount?: number | null
          deposit_type?: string | null
          description?: string | null
          difficulty_level?: number | null
          duration_minutes?: number | null
          estimated_hours?: number | null
          features?: string | null
          form_schema?: Json | null
          has_variants?: boolean | null
          id?: string
          is_active?: boolean
          is_bookable?: boolean | null
          is_public?: boolean | null
          legacy_negocio_id?: string | null
          max_capacity?: number | null
          max_lead_days?: number | null
          max_quantity?: number | null
          min_notice_minutes?: number | null
          min_quantity?: number | null
          name: string
          price_variations?: Json | null
          priority_level?: number | null
          profit_margin?: number | null
          required_resource_type?: string | null
          requires_confirmation?: boolean | null
          requires_diagnosis?: boolean | null
          requires_parts?: boolean | null
          room_required?: boolean | null
          skill_requirements?: string[] | null
          tax_rate?: number | null
          tools_required?: string[] | null
          unit_type?: string | null
          updated_at?: string | null
          warranty_days?: number | null
        }
        Update: {
          allow_direct_contracting?: boolean | null
          base_features?: Json | null
          base_price?: number | null
          booking_color?: string | null
          buffer_minutes?: number | null
          can_be_remote?: boolean | null
          category?: string | null
          company_id?: string
          cost_price?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deposit_amount?: number | null
          deposit_type?: string | null
          description?: string | null
          difficulty_level?: number | null
          duration_minutes?: number | null
          estimated_hours?: number | null
          features?: string | null
          form_schema?: Json | null
          has_variants?: boolean | null
          id?: string
          is_active?: boolean
          is_bookable?: boolean | null
          is_public?: boolean | null
          legacy_negocio_id?: string | null
          max_capacity?: number | null
          max_lead_days?: number | null
          max_quantity?: number | null
          min_notice_minutes?: number | null
          min_quantity?: number | null
          name?: string
          price_variations?: Json | null
          priority_level?: number | null
          profit_margin?: number | null
          required_resource_type?: string | null
          requires_confirmation?: boolean | null
          requires_diagnosis?: boolean | null
          requires_parts?: boolean | null
          room_required?: boolean | null
          skill_requirements?: string[] | null
          tax_rate?: number | null
          tools_required?: string[] | null
          unit_type?: string | null
          updated_at?: string | null
          warranty_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      services_tags: {
        Row: {
          created_at: string | null
          service_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          service_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          service_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_tags_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_tags_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "global_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      social_metrics: {
        Row: {
          company_id: string
          created_at: string | null
          date: string
          engagement_rate: number | null
          followers: number | null
          id: string
          platform: string
          posts_count: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          date: string
          engagement_rate?: number | null
          followers?: number | null
          id?: string
          platform: string
          posts_count?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          date?: string
          engagement_rate?: number | null
          followers?: number | null
          id?: string
          platform?: string
          posts_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "social_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          movement_type: string
          notes: string | null
          product_id: string
          quantity_change: number
          reference_id: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          product_id: string
          quantity_change: number
          reference_id?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string
          quantity_change?: number
          reference_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          catalog_product_id: string
          company_id: string
          created_at: string | null
          currency: string | null
          id: string
          last_checked_at: string | null
          price: number
          supplier_id: string
          supplier_sku: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          catalog_product_id: string
          company_id: string
          created_at?: string | null
          currency?: string | null
          id?: string
          last_checked_at?: string | null
          price?: number
          supplier_id: string
          supplier_sku?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          catalog_product_id?: string
          company_id?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          last_checked_at?: string | null
          price?: number
          supplier_id?: string
          supplier_sku?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "supplier_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          company_id: string
          created_at: string | null
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          tax_id: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      tag_scopes: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          label: string
          module_key: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          label: string
          module_key?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string
          module_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_scopes_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "tag_scopes_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "v_current_user_modules"
            referencedColumns: ["key"]
          },
        ]
      }
      ticket_comment_attachments: {
        Row: {
          attachment_id: string
          comment_id: string
          linked_at: string | null
        }
        Insert: {
          attachment_id: string
          comment_id: string
          linked_at?: string | null
        }
        Update: {
          attachment_id?: string
          comment_id?: string
          linked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comment_attachments_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comment_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comment_versions: {
        Row: {
          changed_by: string | null
          comment_id: string
          content: string
          created_at: string | null
          id: string
        }
        Insert: {
          changed_by?: string | null
          comment_id: string
          content: string
          created_at?: string | null
          id?: string
        }
        Update: {
          changed_by?: string | null
          comment_id?: string
          content?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comment_versions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          client_id: string | null
          comment: string
          company_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_internal: boolean
          parent_id: string | null
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          comment: string
          company_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_internal?: boolean
          parent_id?: string | null
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          comment?: string
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_internal?: boolean
          parent_id?: string | null
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_user_id_fkey_public"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_comments_user_id_fkey_public"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "ticket_comments_user_id_fkey_public"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      ticket_devices: {
        Row: {
          assigned_at: string | null
          completed_at: string | null
          created_at: string | null
          current_task: string | null
          device_id: string
          id: string
          progress_percentage: number | null
          relation_type: string | null
          ticket_id: string
        }
        Insert: {
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_task?: string | null
          device_id: string
          id?: string
          progress_percentage?: number | null
          relation_type?: string | null
          ticket_id: string
        }
        Update: {
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_task?: string | null
          device_id?: string
          id?: string
          progress_percentage?: number | null
          relation_type?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_devices_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_devices_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_macros: {
        Row: {
          company_id: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_macros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_macros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_macros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_macros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      ticket_products: {
        Row: {
          catalog_product_id: string | null
          company_id: string | null
          created_at: string
          id: string
          price_per_unit: number
          product_id: string | null
          quantity: number
          ticket_id: string
          total_price: number
          updated_at: string
        }
        Insert: {
          catalog_product_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          price_per_unit?: number
          product_id?: string | null
          quantity?: number
          ticket_id: string
          total_price?: number
          updated_at?: string
        }
        Update: {
          catalog_product_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          price_per_unit?: number
          product_id?: string | null
          quantity?: number
          ticket_id?: string
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_products_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "ticket_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_products_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_services: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          price_per_unit: number | null
          quantity: number | null
          service_id: string
          ticket_id: string
          total_price: number | null
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          price_per_unit?: number | null
          quantity?: number | null
          service_id: string
          ticket_id: string
          total_price?: number | null
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          price_per_unit?: number | null
          quantity?: number | null
          service_id?: string
          ticket_id?: string
          total_price?: number | null
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "ticket_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_services_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_services_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_stages: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          name: string
          position: number
          stage_category: Database["public"]["Enums"]["stage_category"] | null
          updated_at: string | null
          workflow_category:
            | Database["public"]["Enums"]["workflow_category"]
            | null
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          position: number
          stage_category?: Database["public"]["Enums"]["stage_category"] | null
          updated_at?: string | null
          workflow_category?:
            | Database["public"]["Enums"]["workflow_category"]
            | null
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          position?: number
          stage_category?: Database["public"]["Enums"]["stage_category"] | null
          updated_at?: string | null
          workflow_category?:
            | Database["public"]["Enums"]["workflow_category"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      ticket_timeline: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string | null
          event_type: string
          id: string
          is_public: boolean | null
          metadata: Json | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          created_at?: string | null
          event_type: string
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string | null
          event_type?: string
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_timeline_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_timeline_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "ticket_timeline_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "ticket_timeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_timeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_timeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_timeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "ticket_timeline_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          actual_hours: number | null
          assigned_to: string | null
          client_id: string | null
          closed_at: string | null
          comments: string[] | null
          company_id: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          first_response_at: string | null
          id: string
          is_opened: boolean
          priority: string | null
          resolution_time_mins: number | null
          sla_status: string | null
          stage_id: string | null
          ticket_month: string | null
          ticket_number: number
          title: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string | null
          client_id?: string | null
          closed_at?: string | null
          comments?: string[] | null
          company_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          first_response_at?: string | null
          id?: string
          is_opened?: boolean
          priority?: string | null
          resolution_time_mins?: number | null
          sla_status?: string | null
          stage_id?: string | null
          ticket_month?: string | null
          ticket_number?: number
          title: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string | null
          client_id?: string | null
          closed_at?: string | null
          comments?: string[] | null
          company_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          first_response_at?: string | null
          id?: string
          is_opened?: boolean
          priority?: string | null
          resolution_time_mins?: number | null
          sla_status?: string | null
          stage_id?: string | null
          ticket_month?: string | null
          ticket_number?: number
          title?: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "tickets_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "ticket_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_tags: {
        Row: {
          created_at: string | null
          tag_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string | null
          tag_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string | null
          tag_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "global_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tags_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_modules: {
        Row: {
          created_at: string | null
          id: string
          module_key: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          module_key: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          module_key?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string | null
          email_notifications: boolean | null
          marketing_accepted: boolean | null
          sms_notifications: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_notifications?: boolean | null
          marketing_accepted?: boolean | null
          sms_notifications?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_notifications?: boolean | null
          marketing_accepted?: boolean | null
          sms_notifications?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          account_locked_until: string | null
          active: boolean | null
          app_role_id: string | null
          auth_user_id: string | null
          company_id: string | null
          created_at: string | null
          data_access_level: string | null
          deleted_at: string | null
          email: string
          failed_login_attempts: number | null
          gdpr_training_completed: boolean | null
          gdpr_training_date: string | null
          id: string
          is_dpo: boolean | null
          last_privacy_policy_accepted: string | null
          last_session_at: string | null
          name: string | null
          permissions: Json | null
          surname: string | null
          updated_at: string | null
        }
        Insert: {
          account_locked_until?: string | null
          active?: boolean | null
          app_role_id?: string | null
          auth_user_id?: string | null
          company_id?: string | null
          created_at?: string | null
          data_access_level?: string | null
          deleted_at?: string | null
          email: string
          failed_login_attempts?: number | null
          gdpr_training_completed?: boolean | null
          gdpr_training_date?: string | null
          id?: string
          is_dpo?: boolean | null
          last_privacy_policy_accepted?: string | null
          last_session_at?: string | null
          name?: string | null
          permissions?: Json | null
          surname?: string | null
          updated_at?: string | null
        }
        Update: {
          account_locked_until?: string | null
          active?: boolean | null
          app_role_id?: string | null
          auth_user_id?: string | null
          company_id?: string | null
          created_at?: string | null
          data_access_level?: string | null
          deleted_at?: string | null
          email?: string
          failed_login_attempts?: number | null
          gdpr_training_completed?: boolean | null
          gdpr_training_date?: string | null
          id?: string
          is_dpo?: boolean | null
          last_privacy_policy_accepted?: string | null
          last_session_at?: string | null
          name?: string | null
          permissions?: Json | null
          surname?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_app_role_id_fkey"
            columns: ["app_role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      verifactu_cert_history: {
        Row: {
          cert_pem_enc: string | null
          company_id: string
          id: string
          integrity_hash: string | null
          key_pass_enc: string | null
          key_pem_enc: string | null
          notes: string | null
          rotated_by: string | null
          stored_at: string
          version: number
        }
        Insert: {
          cert_pem_enc?: string | null
          company_id: string
          id?: string
          integrity_hash?: string | null
          key_pass_enc?: string | null
          key_pem_enc?: string | null
          notes?: string | null
          rotated_by?: string | null
          stored_at?: string
          version: number
        }
        Update: {
          cert_pem_enc?: string | null
          company_id?: string
          id?: string
          integrity_hash?: string | null
          key_pass_enc?: string | null
          key_pem_enc?: string | null
          notes?: string | null
          rotated_by?: string | null
          stored_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "verifactu_cert_history_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "verifactu_settings"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "verifactu_cert_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "verifactu_settings"
            referencedColumns: ["company_id"]
          },
        ]
      }
      verifactu_events: {
        Row: {
          companyid: string
          created_at: string
          eventtype: string
          id: string
          invoiceid: string | null
          payload: Json
        }
        Insert: {
          companyid: string
          created_at?: string
          eventtype: string
          id?: string
          invoiceid?: string | null
          payload: Json
        }
        Update: {
          companyid?: string
          created_at?: string
          eventtype?: string
          id?: string
          invoiceid?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "verifactu_events_companyid_fkey"
            columns: ["companyid"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifactu_events_companyid_fkey"
            columns: ["companyid"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifactu_events_companyid_fkey"
            columns: ["companyid"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "verifactu_events_companyid_fkey"
            columns: ["companyid"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "verifactu_events_invoiceid_fkey"
            columns: ["invoiceid"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      verifactu_function_log: {
        Row: {
          auth_role: string | null
          error: string | null
          function: string | null
          id: string
          remote_ip: string | null
          request_payload: Json | null
          status: number | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          auth_role?: string | null
          error?: string | null
          function?: string | null
          id?: string
          remote_ip?: string | null
          request_payload?: Json | null
          status?: number | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          auth_role?: string | null
          error?: string | null
          function?: string | null
          id?: string
          remote_ip?: string | null
          request_payload?: Json | null
          status?: number | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      verifactu_invoice_meta: {
        Row: {
          created_at: string
          invoice_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          invoice_id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          invoice_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      verifactu_settings: {
        Row: {
          cert_pem_enc: string | null
          company_id: string
          created_at: string
          environment: string
          issuer_nif: string
          key_pass_enc: string | null
          key_pem_enc: string | null
          software_code: string
          updated_at: string
        }
        Insert: {
          cert_pem_enc?: string | null
          company_id: string
          created_at?: string
          environment: string
          issuer_nif: string
          key_pass_enc?: string | null
          key_pem_enc?: string | null
          software_code: string
          updated_at?: string
        }
        Update: {
          cert_pem_enc?: string | null
          company_id?: string
          created_at?: string
          environment?: string
          issuer_nif?: string
          key_pass_enc?: string | null
          key_pem_enc?: string | null
          software_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifactu_settings_companyid_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifactu_settings_companyid_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifactu_settings_companyid_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "verifactu_settings_companyid_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      waitlist: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          end_time: string
          id: string
          notes: string | null
          service_id: string
          start_time: string
          status: Database["public"]["Enums"]["waitlist_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          service_id: string
          start_time: string
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          service_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "waitlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "waitlist_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_company_analysis: {
        Row: {
          admins_count: number | null
          created_at: string | null
          id: string | null
          members_count: number | null
          name: string | null
          owner_emails: string | null
          owners_count: number | null
          pending_invitations: number | null
          slug: string | null
          total_users: number | null
        }
        Relationships: []
      }
      admin_pending_users: {
        Row: {
          company_name: string | null
          confirmed_at: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          full_name: string | null
          id: string | null
          status: string | null
        }
        Insert: {
          company_name?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          full_name?: string | null
          id?: string | null
          status?: never
        }
        Update: {
          company_name?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          full_name?: string | null
          id?: string | null
          status?: never
        }
        Relationships: []
      }
      client_visible_bookings: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string | null
          customer_email: string | null
          end_time: string | null
          id: string | null
          payment_status: string | null
          professional_id: string | null
          professional_name: string | null
          service_duration: number | null
          service_id: string | null
          service_name: string | null
          start_time: string | null
          status: string | null
          total_price: number | null
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
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "client_visible_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      client_visible_quotes: {
        Row: {
          accepted_at: string | null
          anonymized_at: string | null
          client_id: string | null
          client_ip_address: unknown
          client_user_agent: string | null
          client_viewed_at: string | null
          company_id: string | null
          conversion_status: string | null
          convert_policy: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deposit_percentage: number | null
          description: string | null
          digital_signature: string | null
          discount_amount: number | null
          discount_percent: number | null
          full_quote_number: string | null
          id: string | null
          invoice_id: string | null
          invoice_on_date: string | null
          invoiced_at: string | null
          is_anonymized: boolean | null
          language: string | null
          last_run_at: string | null
          next_run_at: string | null
          notes: string | null
          pdf_generated_at: string | null
          pdf_url: string | null
          quote_date: string | null
          quote_month: string | null
          quote_number: string | null
          rectification_reason: string | null
          rectifies_invoice_id: string | null
          recurrence_day: number | null
          recurrence_end_date: string | null
          recurrence_interval: number | null
          recurrence_start_date: string | null
          recurrence_type: string | null
          rejected_at: string | null
          retention_until: string | null
          scheduled_conversion_date: string | null
          sequence_number: number | null
          signature_timestamp: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          subtotal: number | null
          tax_amount: number | null
          terms_conditions: string | null
          ticket_id: string | null
          title: string | null
          total_amount: number | null
          updated_at: string | null
          valid_until: string | null
          year: number | null
        }
        Relationships: []
      }
      client_visible_services: {
        Row: {
          base_features: Json | null
          base_price: number | null
          can_be_remote: boolean | null
          category: string | null
          company_id: string | null
          cost_price: number | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          difficulty_level: number | null
          estimated_hours: number | null
          features: string | null
          has_variants: boolean | null
          id: string | null
          is_active: boolean | null
          is_public: boolean | null
          legacy_negocio_id: string | null
          max_quantity: number | null
          min_quantity: number | null
          name: string | null
          priority_level: number | null
          profit_margin: number | null
          requires_diagnosis: boolean | null
          requires_parts: boolean | null
          skill_requirements: string[] | null
          tax_rate: number | null
          tools_required: string[] | null
          unit_type: string | null
          updated_at: string | null
          warranty_days: number | null
        }
        Insert: {
          base_features?: Json | null
          base_price?: number | null
          can_be_remote?: boolean | null
          category?: string | null
          company_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          difficulty_level?: number | null
          estimated_hours?: number | null
          features?: string | null
          has_variants?: boolean | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          legacy_negocio_id?: string | null
          max_quantity?: number | null
          min_quantity?: number | null
          name?: string | null
          priority_level?: number | null
          profit_margin?: number | null
          requires_diagnosis?: boolean | null
          requires_parts?: boolean | null
          skill_requirements?: string[] | null
          tax_rate?: number | null
          tools_required?: string[] | null
          unit_type?: string | null
          updated_at?: string | null
          warranty_days?: number | null
        }
        Update: {
          base_features?: Json | null
          base_price?: number | null
          can_be_remote?: boolean | null
          category?: string | null
          company_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          difficulty_level?: number | null
          estimated_hours?: number | null
          features?: string | null
          has_variants?: boolean | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          legacy_negocio_id?: string | null
          max_quantity?: number | null
          min_quantity?: number | null
          name?: string | null
          priority_level?: number | null
          profit_margin?: number | null
          requires_diagnosis?: boolean | null
          requires_parts?: boolean | null
          skill_requirements?: string[] | null
          tax_rate?: number | null
          tools_required?: string[] | null
          unit_type?: string | null
          updated_at?: string | null
          warranty_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      client_visible_tickets: {
        Row: {
          actual_hours: number | null
          client_id: string | null
          comments: string[] | null
          company_id: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string | null
          is_opened: boolean | null
          priority: string | null
          stage_id: string | null
          ticket_number: number | null
          title: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      gdpr_consent_overview: {
        Row: {
          client_name: string | null
          consent_date: string | null
          consent_given: boolean | null
          consent_method: string | null
          consent_type: string | null
          is_active: boolean | null
          purpose: string | null
          subject_email: string | null
          withdrawn_at: string | null
        }
        Relationships: []
      }
      gdpr_processing_inventory: {
        Row: {
          activity_name: string | null
          affected_subjects_count: number | null
          created_at: string | null
          cross_border_transfers: Json | null
          data_categories: string[] | null
          data_subjects: string[] | null
          legal_basis: string | null
          purpose: string | null
          recipients: string[] | null
          retention_period: unknown
          updated_at: string | null
        }
        Relationships: []
      }
      invoiceseries: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_active: boolean | null
          is_default: boolean | null
          last_verifactu_hash: string | null
          next_number: number | null
          prefix: string | null
          series_code: string | null
          series_name: string | null
          updated_at: string | null
          verifactu_enabled: boolean | null
          year: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          last_verifactu_hash?: string | null
          next_number?: number | null
          prefix?: string | null
          series_code?: string | null
          series_name?: string | null
          updated_at?: string | null
          verifactu_enabled?: boolean | null
          year?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          last_verifactu_hash?: string | null
          next_number?: number | null
          prefix?: string | null
          series_code?: string | null
          series_name?: string | null
          updated_at?: string | null
          verifactu_enabled?: boolean | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoice_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
          {
            foreignKeyName: "invoice_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "valid_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          last_session_at: string | null
          role: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      user_company_context: {
        Row: {
          auth_user_id: string | null
          company_id: string | null
          role: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      users_with_company: {
        Row: {
          company_id: string | null
          company_name: string | null
          company_website: string | null
          email: string | null
          id: string | null
          legacy_negocio_id: string | null
          name: string | null
          permissions: Json | null
          surname: string | null
          user_created_at: string | null
        }
        Relationships: []
      }
      v_current_user_modules: {
        Row: {
          created_at: string | null
          description: string | null
          enabled_by_default: boolean | null
          is_active: boolean | null
          key: string | null
          name: string | null
          position: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      valid_users_view: {
        Row: {
          account_locked_until: string | null
          active: boolean | null
          auth_user_id: string | null
          company_id: string | null
          created_at: string | null
          data_access_level: string | null
          deleted_at: string | null
          email: string | null
          failed_login_attempts: number | null
          gdpr_training_completed: boolean | null
          gdpr_training_date: string | null
          has_auth: boolean | null
          id: string | null
          is_dpo: boolean | null
          last_privacy_policy_accepted: string | null
          last_session_at: string | null
          name: string | null
          permissions: Json | null
          role: string | null
          surname: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
      visible_stages_by_company: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          is_hidden: boolean | null
          name: string | null
          position: number | null
          stage_type: string | null
          updated_at: string | null
          viewing_company_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "admin_company_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users_with_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "visible_stages_by_company"
            referencedColumns: ["viewing_company_id"]
          },
        ]
      }
    }
    Functions: {
      accept_company_invitation: {
        Args: { p_auth_user_id: string; p_invitation_token: string }
        Returns: Json
      }
      accept_company_invitation_admin: {
        Args: { p_auth_user_id: string; p_invitation_token: string }
        Returns: Json
      }
      accept_company_invitation_by_email: {
        Args: { p_auth_user_id: string; p_email: string }
        Returns: Json
      }
      activate_invited_user: {
        Args: { auth_user_id: string; user_email: string }
        Returns: Json
      }
      add_client_note: {
        Args: { p_client_id: string; p_company_id: string; p_content: string }
        Returns: string
      }
      admin_list_companies: { Args: never; Returns: Json }
      admin_list_company_modules: {
        Args: { p_company_id: string }
        Returns: Json
      }
      admin_list_owners: { Args: never; Returns: Json }
      admin_list_user_modules: {
        Args: { p_company_id?: string }
        Returns: Json
      }
      admin_set_company_module: {
        Args: {
          p_module_key: string
          p_status: string
          p_target_company_id: string
        }
        Returns: Json
      }
      admin_set_user_module: {
        Args: {
          p_module_key: string
          p_status: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      admin_toggle_company_module: {
        Args: { p_company_id: string; p_module_key: string; p_status: string }
        Returns: Json
      }
      anonymize_client_data:
        | { Args: { p_client_id: string }; Returns: Json }
        | {
            Args: {
              p_client_id: string
              p_reason?: string
              p_requesting_user_id?: string
            }
            Returns: Json
          }
      auth_has_permission: {
        Args: { p_company_id: string; p_permission: string }
        Returns: boolean
      }
      auth_user_email: { Args: never; Returns: string }
      calculate_annual_price: {
        Args: { p_discount_percentage?: number; p_monthly_price: number }
        Returns: number
      }
      calculate_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      cancel_contracted_service: {
        Args: { p_quote_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_invoice: {
        Args: { p_invoice_id: string; p_reason?: string }
        Returns: Json
      }
      check_company_exists: {
        Args: { p_company_name: string }
        Returns: {
          company_exists: boolean
          company_id: string
          company_name: string
          owner_email: string
          owner_name: string
        }[]
      }
      check_gdpr_compliance: {
        Args: never
        Returns: {
          check_name: string
          is_compliant: boolean
          status: string
          value: string
        }[]
      }
      clean_expired_pending_users: { Args: never; Returns: number }
      cleanup_current_duplicates: { Args: never; Returns: string }
      cleanup_duplicate_companies: {
        Args: never
        Returns: {
          action: string
          details: string
        }[]
      }
      cleanup_expired_gdpr_data: {
        Args: never
        Returns: {
          audit_logs_deleted: number
          clients_anonymized: number
          old_consents_archived: number
        }[]
      }
      client_can_access_company: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      client_cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      client_create_booking: {
        Args: {
          p_company_id: string
          p_end_time: string
          p_service_id: string
          p_start_time: string
        }
        Returns: Json
      }
      client_get_preferences: { Args: never; Returns: Json }
      client_get_visible_quotes: {
        Args: never
        Returns: {
          accepted_at: string | null
          anonymized_at: string | null
          booking_id: string | null
          client_id: string
          client_ip_address: unknown
          client_user_agent: string | null
          client_viewed_at: string | null
          company_id: string
          conversion_status: string
          convert_policy: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deposit_percentage: number | null
          description: string | null
          digital_signature: string | null
          discount_amount: number | null
          discount_percent: number | null
          full_quote_number: string | null
          id: string
          invoice_id: string | null
          invoice_on_date: string | null
          invoiced_at: string | null
          is_anonymized: boolean | null
          language: string | null
          last_run_at: string | null
          next_run_at: string | null
          notes: string | null
          pdf_generated_at: string | null
          pdf_url: string | null
          quote_date: string
          quote_month: string | null
          quote_number: string
          rectification_reason: string | null
          rectifies_invoice_id: string | null
          recurrence_day: number | null
          recurrence_end_date: string | null
          recurrence_interval: number
          recurrence_start_date: string | null
          recurrence_type: string
          rejected_at: string | null
          rejection_reason: string | null
          retention_until: string | null
          scheduled_conversion_date: string | null
          sequence_number: number
          signature_timestamp: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_amount: number
          terms_conditions: string | null
          ticket_id: string | null
          title: string
          total_amount: number
          updated_at: string | null
          valid_until: string
          year: number
        }[]
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      client_get_visible_tickets: {
        Args: never
        Returns: {
          actual_hours: number | null
          assigned_to: string | null
          client_id: string | null
          closed_at: string | null
          comments: string[] | null
          company_id: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          first_response_at: string | null
          id: string
          is_opened: boolean
          priority: string | null
          resolution_time_mins: number | null
          sla_status: string | null
          stage_id: string | null
          ticket_month: string | null
          ticket_number: number
          title: string
          total_amount: number | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      client_reschedule_booking: {
        Args: {
          p_booking_id: string
          p_new_end_time: string
          p_new_start_time: string
        }
        Returns: Json
      }
      client_update_preferences: {
        Args: {
          p_email_notifications: boolean
          p_marketing_accepted: boolean
          p_sms_notifications: boolean
        }
        Returns: Json
      }
      client_update_profile: {
        Args: { p_avatar_url?: string; p_full_name: string; p_phone: string }
        Returns: Json
      }
      column_exists: {
        Args: { column_name: string; table_name: string }
        Returns: boolean
      }
      company_has_module: {
        Args: { p_company_id: string; p_module_key: string }
        Returns: boolean
      }
      confirm_user_registration:
        | { Args: { p_auth_user_id: string }; Returns: Json }
        | {
            Args: { p_auth_user_id: string; p_confirmation_token: string }
            Returns: Json
          }
      contract_service_rpc: {
        Args: { p_service_id: string; p_variant_id?: string }
        Returns: Json
      }
      convert_quote_to_invoice:
        | { Args: { p_quote_id: string }; Returns: string }
        | {
            Args: { p_invoice_series_id?: string; p_quote_id: string }
            Returns: string
          }
      count_customers_by_user: {
        Args: { target_user_id: string }
        Returns: number
      }
      create_address_dev: {
        Args: {
          p_codigo_postal?: string
          p_direccion: string
          p_locality_id?: string
          p_numero?: string
          p_piso?: string
          p_puerta?: string
          target_user_id: string
        }
        Returns: string
      }
      create_attachment: {
        Args: {
          p_company_id: string
          p_file_name: string
          p_file_size?: number
          p_job_id: string
          p_mime_type?: string
          p_subfolder?: string
        }
        Returns: string
      }
      create_clinical_note: {
        Args: { p_client_id: string; p_content: string }
        Returns: Json
      }
      create_company_with_owner: {
        Args: { p_name: string; p_nif?: string; p_slug: string }
        Returns: Json
      }
      create_customer_dev:
        | {
            Args: {
              p_apellidos: string
              p_dni?: string
              p_email: string
              p_nombre: string
              p_telefono?: string
              target_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_apellidos: string
              p_avatar_url?: string
              p_direccion_id?: string
              p_dni?: string
              p_email: string
              p_empresa?: string
              p_fecha_nacimiento?: string
              p_nombre: string
              p_notas?: string
              p_profesion?: string
              p_telefono?: string
              target_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_apellidos: string
              p_avatar_url?: string
              p_dni?: string
              p_email: string
              p_empresa?: string
              p_fecha_nacimiento?: string
              p_nombre: string
              p_profesion?: string
              p_telefono?: string
              target_user_id: string
            }
            Returns: string
          }
      create_default_project_stages: {
        Args: { company_uuid: string }
        Returns: undefined
      }
      create_gdpr_access_request: {
        Args: {
          p_request_details?: Json
          p_request_type: string
          p_requesting_user_id?: string
          p_subject_email: string
          p_subject_name?: string
        }
        Returns: Json
      }
      create_notification:
        | {
            Args: {
              p_company_id: string
              p_content: string
              p_metadata?: Json
              p_recipient_id: string
              p_reference_id: string
              p_title: string
              p_type: string
            }
            Returns: string
          }
        | {
            Args: {
              p_company_id: string
              p_content: string
              p_metadata?: Json
              p_recipient_id: string
              p_reference_id: string
              p_title: string
              p_type: string
            }
            Returns: string
          }
      create_rectification_quote:
        | { Args: { p_invoice_id: string }; Returns: string }
        | {
            Args: { p_invoice_id: string; p_rectification_reason?: string }
            Returns: string
          }
      create_ticket: {
        Args: {
          p_assigned_to?: string
          p_client_id: string
          p_company_id: string
          p_description: string
          p_device_id?: string
          p_due_date?: string
          p_initial_attachment_url?: string
          p_initial_comment?: string
          p_priority: string
          p_products?: Json
          p_services?: Json
          p_stage_id?: string
          p_title: string
        }
        Returns: Json
      }
      current_company_id: { Args: never; Returns: string }
      current_user_is_admin: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      debug_admin_access: { Args: never; Returns: Json }
      debug_auth_status: { Args: never; Returns: Json }
      debug_client_modules: { Args: { p_auth_user_id: string }; Returns: Json }
      delete_customer_dev: {
        Args: { client_id: string; target_user_id: string }
        Returns: boolean
      }
      enqueue_verifactu_dispatch:
        | {
            Args: { pcompany_id: string; pinvoice_id: string }
            Returns: undefined
          }
        | { Args: { pinvoiceid: string }; Returns: undefined }
      ensure_all_companies: { Args: never; Returns: string }
      export_client_gdpr_data: {
        Args: { p_client_id: string; p_requesting_user_id?: string }
        Returns: Json
      }
      f_analytics_occupancy_heatmap: {
        Args: {
          p_company_id: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          booking_count: number
          day_of_week: number
          hour_of_day: number
        }[]
      }
      f_analytics_revenue_forecast: {
        Args: { p_company_id: string }
        Returns: {
          period: string
          total_revenue: number
        }[]
      }
      f_analytics_top_performers: {
        Args: { p_company_id: string; p_month_date?: string }
        Returns: {
          bookings_count: number
          professional_id: string
          professional_name: string
          total_revenue: number
        }[]
      }
      f_analytics_top_services: {
        Args: { p_end?: string; p_limit?: number; p_start?: string }
        Returns: {
          bookings_count: number
          service_id: string
          service_name: string
          total_revenue: number
        }[]
      }
      f_booking_analytics_monthly: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          bookings_count: number
          cancelled_count: number
          company_id: string
          confirmed_count: number
          period_month: string
          total_hours: number
          total_revenue: number
        }[]
      }
      f_invoice_collection_status: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          avg_days_overdue: number
          company_id: string
          created_by: string
          overdue_count: number
          total_collected: number
          total_invoiced: number
          total_overdue: number
          total_pending: number
        }[]
      }
      f_invoice_kpis_monthly: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          avg_invoice_value: number
          cancelled_count: number
          collected_sum: number
          collection_rate: number
          company_id: string
          created_by: string
          draft_count: number
          invoices_count: number
          overdue_count: number
          paid_count: number
          paid_total_sum: number
          pending_count: number
          pending_sum: number
          period_month: string
          receivable_sum: number
          subtotal_sum: number
          tax_sum: number
          total_sum: number
        }[]
      }
      f_invoice_kpis_monthly_debug: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          company_id: string
          created_by: string
          invoices_count: number
          period_month: string
          total_sum: number
        }[]
      }
      f_invoice_kpis_monthly_temp: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          avg_invoice_value: number
          cancelled_count: number
          collected_sum: number
          collection_rate: number
          company_id: string
          created_by: string
          draft_count: number
          invoices_count: number
          overdue_count: number
          paid_count: number
          paid_total_sum: number
          pending_count: number
          pending_sum: number
          period_month: string
          receivable_sum: number
          subtotal_sum: number
          tax_sum: number
          total_sum: number
        }[]
      }
      f_mail_get_thread_messages:
        | {
            Args: { p_thread_id: string }
            Returns: {
              account_id: string
              bcc: Json[] | null
              body_html: string | null
              body_text: string | null
              cc: Json[] | null
              created_at: string | null
              folder_id: string | null
              from: Json | null
              id: string
              is_archived: boolean | null
              is_read: boolean | null
              is_starred: boolean | null
              metadata: Json | null
              received_at: string | null
              snippet: string | null
              subject: string | null
              thread_id: string | null
              to: Json[] | null
              updated_at: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "mail_messages"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: { p_account_id: string; p_thread_id: string }
            Returns: {
              account_id: string
              bcc: Json[] | null
              body_html: string | null
              body_text: string | null
              cc: Json[] | null
              created_at: string | null
              folder_id: string | null
              from: Json | null
              id: string
              is_archived: boolean | null
              is_read: boolean | null
              is_starred: boolean | null
              metadata: Json | null
              received_at: string | null
              snippet: string | null
              subject: string | null
              thread_id: string | null
              to: Json[] | null
              updated_at: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "mail_messages"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      f_mail_get_threads:
        | {
            Args: {
              p_account_id: string
              p_folder_id: string
              p_limit?: number
              p_offset?: number
              p_search?: string
            }
            Returns: {
              has_attachments: boolean
              is_read: boolean
              last_message_at: string
              message_count: number
              participants: Json[]
              snippet: string
              subject: string
              thread_id: string
            }[]
          }
        | {
            Args: {
              p_account_id: string
              p_folder_name: string
              p_limit?: number
              p_offset?: number
            }
            Returns: {
              has_attachments: boolean
              is_read: boolean
              last_message_at: string
              message_count: number
              participants: string[]
              snippet: string
              subject: string
              thread_id: string
            }[]
          }
        | {
            Args: {
              p_account_id: string
              p_folder_role: string
              p_limit?: number
              p_offset?: number
              p_search?: string
            }
            Returns: {
              has_attachments: boolean
              is_read: boolean
              last_message_at: string
              message_count: number
              participants: Json[]
              snippet: string
              subject: string
              thread_id: string
            }[]
          }
      f_marketing_get_audience: {
        Args: { p_company_id: string; p_criteria: Json }
        Returns: {
          client_id: string
          email: string
          last_booking_date: string
          name: string
          phone: string
        }[]
      }
      f_marketing_get_automation_audience: {
        Args: {
          p_company_id: string
          p_config: Json
          p_trigger_type: Database["public"]["Enums"]["campaign_trigger_type"]
        }
        Returns: {
          client_id: string
          email: string
          name: string
        }[]
      }
      f_quote_cube: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          company_id: string
          conversion_status: string
          created_by: string
          group_id: number
          period_month: string
          quotes_count: number
          status: string
          subtotal_sum: number
          tax_sum: number
          total_sum: number
        }[]
      }
      f_quote_kpis_monthly: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          avg_days_to_accept: number
          company_id: string
          conversion_rate: number
          converted_count: number
          draft_count: number
          pending_count: number
          period_month: string
          quotes_count: number
          subtotal_sum: number
          tax_sum: number
          total_sum: number
        }[]
      }
      f_quote_kpis_monthly_enhanced: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          avg_days_to_accept: number
          company_id: string
          conversion_rate: number
          converted_count: number
          draft_count: number
          pending_count: number
          period_month: string
          quotes_count: number
          subtotal_sum: number
          tax_sum: number
          total_sum: number
        }[]
      }
      f_quote_pipeline_current: {
        Args: never
        Returns: {
          accepted_count: number
          company_id: string
          draft_count: number
          expired_count: number
          quotes_count: number
          sent_count: number
          subtotal_sum: number
          tax_sum: number
          total_sum: number
        }[]
      }
      f_quote_projected_revenue: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          company_id: string
          draft_count: number
          grand_total: number
          period_month: string
          subtotal: number
          tax_amount: number
        }[]
      }
      f_quote_recurring_monthly: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          company_id: string
          grand_total: number
          period_month: string
          recurring_count: number
          subtotal: number
          tax_amount: number
        }[]
      }
      f_quote_top_items_monthly: {
        Args: { p_end?: string; p_limit?: number; p_start?: string }
        Returns: {
          company_id: string
          created_by: string
          item_id: string
          period_month: string
          qty_sum: number
          rn_by_amount: number
          rn_by_qty: number
          subtotal_sum: number
          total_sum: number
        }[]
      }
      f_refresh_analytics_views: { Args: never; Returns: undefined }
      f_ticket_current_status: {
        Args: never
        Returns: {
          avg_age_days: number
          company_id: string
          critical_open: number
          high_open: number
          oldest_ticket_days: number
          total_completed: number
          total_in_progress: number
          total_open: number
          total_overdue: number
        }[]
      }
      f_ticket_kpis_monthly: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          avg_resolution_days: number
          company_id: string
          completed_count: number
          completed_this_month: number
          critical_count: number
          high_priority_count: number
          in_progress_count: number
          invoiced_amount_sum: number
          low_priority_count: number
          max_resolution_days: number
          min_resolution_days: number
          normal_priority_count: number
          open_count: number
          overdue_count: number
          period_month: string
          resolution_rate: number
          tickets_created: number
          total_amount_sum: number
        }[]
      }
      finalize_invoice: {
        Args: {
          p_device_id?: string
          p_invoice_id: string
          p_series: string
          p_software_id?: string
        }
        Returns: Json
      }
      fix_bet_drop_link: { Args: never; Returns: Json }
      fn_is_variant_visible: {
        Args: { p_variant_id: string }
        Returns: boolean
      }
      gdpr_accept_consent: {
        Args: { p_evidence?: Json; p_preferences: Json; p_token: string }
        Returns: Json
      }
      gdpr_anonymize_client: {
        Args: {
          anonymization_reason: string
          client_id: string
          requesting_user_id: string
        }
        Returns: Json
      }
      gdpr_create_consent_request: {
        Args: {
          p_client_id: string
          p_consent_types: string[]
          p_expires?: unknown
          p_purpose?: string
          p_subject_email: string
        }
        Returns: Json
      }
      gdpr_decline_consent: {
        Args: { p_evidence?: Json; p_token: string }
        Returns: Json
      }
      gdpr_export_client_data: {
        Args: { client_email: string; requesting_user_id: string }
        Returns: Json
      }
      gdpr_get_consent_request: { Args: { p_token: string }; Returns: Json }
      gdpr_log_access: {
        Args: {
          action_type: string
          company_id: string
          new_values?: Json
          old_values?: Json
          purpose?: string
          record_id?: string
          subject_email?: string
          table_name: string
          user_id: string
        }
        Returns: boolean
      }
      generate_file_path: {
        Args: { company_uuid: string; file_name: string; subfolder?: string }
        Returns: string
      }
      generate_verifactu_hash: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      get_addresses_dev: {
        Args: { target_user_id: string }
        Returns: {
          codigo_postal: string
          created_at: string
          direccion: string
          id: string
          locality_id: string
          numero: string
          piso: string
          puerta: string
          updated_at: string
          usuario_id: string
        }[]
      }
      get_all_companies_stats: { Args: never; Returns: Json }
      get_all_users_with_customers: {
        Args: never
        Returns: {
          customer_count: number
          user_id: string
        }[]
      }
      get_availability_data: {
        Args: { p_company_id: string; p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_booking_config: { Args: { p_company_id: string }; Returns: Json }
      get_client_clinical_notes: {
        Args: { p_client_id: string }
        Returns: {
          client_id: string
          content: string
          created_at: string
          created_by_name: string
          id: string
        }[]
      }
      get_client_consent_request: { Args: { p_token: string }; Returns: Json }
      get_client_consent_status: {
        Args: { p_client_id: string; p_requesting_user_id?: string }
        Returns: Json
      }
      get_client_notes: {
        Args: { p_client_id: string }
        Returns: Database["public"]["CompositeTypes"]["note_decrypted"][]
        SetofOptions: {
          from: "*"
          to: "note_decrypted"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_company_id_from_jwt: { Args: never; Returns: string }
      get_company_invitation_token: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      get_company_schedule: {
        Args: { p_company_id: string }
        Returns: {
          day_of_week: number
          end_time: string
          is_unavailable: boolean
          start_time: string
          user_id: string
        }[]
      }
      get_company_services_with_variants: {
        Args: { p_company_id: string }
        Returns: Json
      }
      get_config_stages: {
        Args: never
        Returns: {
          color: string
          company_id: string
          id: string
          is_hidden: boolean
          name: string
          position: number
          stage_category: Database["public"]["Enums"]["stage_category"]
          workflow_category: Database["public"]["Enums"]["workflow_category"]
        }[]
      }
      get_config_units: { Args: never; Returns: Json }
      get_customer_stats: { Args: { user_id: string }; Returns: Json }
      get_customer_stats_dev: {
        Args: { target_user_id: string }
        Returns: Json
      }
      get_customers_dev: {
        Args: { target_user_id: string }
        Returns: {
          activo: boolean
          apellidos: string
          avatar_url: string
          created_at: string
          direccion_id: string
          dni: string
          email: string
          empresa: string
          fecha_nacimiento: string
          id: string
          nombre: string
          notas: string
          profesion: string
          search_vector: unknown
          telefono: string
          updated_at: string
          usuario_id: string
        }[]
      }
      get_daily_revenue: {
        Args: { end_date: string; p_company_id: string; start_date: string }
        Returns: {
          bookings_count: number
          day: string
          revenue: number
        }[]
      }
      get_devices_stats: {
        Args: { company_uuid: string }
        Returns: {
          avg_repair_time: number
          completed_count: number
          delivered_count: number
          in_progress_count: number
          received_count: number
          total_devices: number
        }[]
      }
      get_devices_with_client_info: {
        Args: { company_uuid: string }
        Returns: {
          brand: string
          client_email: string
          client_name: string
          device_id: string
          device_type: string
          estimated_cost: number
          model: string
          progress_days: number
          received_at: string
          status: string
        }[]
      }
      get_effective_modules: {
        Args: { p_input_company_id?: string }
        Returns: Json
      }
      get_effective_role_id: {
        Args: { p_auth_user_id: string; p_company_id: string }
        Returns: string
      }
      get_employee_company_id: { Args: never; Returns: string }
      get_job_attachments: {
        Args: { p_company_id?: string; p_job_id: string }
        Returns: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
        }[]
      }
      get_my_company_id: { Args: never; Returns: string }
      get_my_public_id: { Args: never; Returns: string }
      get_next_invoice_number: {
        Args: { p_series_id: string }
        Returns: string
      }
      get_next_quote_number: {
        Args: { p_company_id: string; p_year: number }
        Returns: number
      }
      get_next_ticket_number: {
        Args: { p_company_id: string }
        Returns: number
      }
      get_or_create_brand: {
        Args: { p_brand_name: string; p_company_id: string }
        Returns: string
      }
      get_or_create_category: {
        Args: { p_category_name: string; p_company_id: string }
        Returns: string
      }
      get_provider_tokens: { Args: { provider_name: string }; Returns: Json }
      get_revenue_by_professional: {
        Args: { end_date: string; p_company_id: string; start_date: string }
        Returns: {
          bookings_count: number
          professional_name: string
          revenue: number
        }[]
      }
      get_revenue_by_service: {
        Args: { end_date: string; p_company_id: string; start_date: string }
        Returns: {
          bookings_count: number
          revenue: number
          service_name: string
        }[]
      }
      get_service_with_variants: {
        Args: { p_service_id: string }
        Returns: Json
      }
      get_sessions_with_booking_counts: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          available_spots: number
          capacity: number
          class_type_id: number
          confirmed_bookings_count: number
          id: number
          schedule_date: string
          schedule_time: string
        }[]
      }
      get_ticket_stats: { Args: { target_company_id: string }; Returns: Json }
      get_top_tags: {
        Args: { limit_count: number; search_scope: string }
        Returns: {
          id: string
          name: string
          usage_count: number
        }[]
      }
      get_top_used_products: {
        Args: { limit_count?: number; target_company_id: string }
        Returns: {
          brand: string
          brand_id: string
          category: string
          category_id: string
          description: string
          id: string
          model: string
          name: string
          price: number
          stock_quantity: number
          usage_count: number
        }[]
      }
      get_top_used_services: {
        Args: { limit_count: number; target_company_id: string }
        Returns: {
          allow_direct_contracting: boolean | null
          base_features: Json | null
          base_price: number | null
          booking_color: string | null
          buffer_minutes: number | null
          can_be_remote: boolean | null
          category: string | null
          company_id: string
          cost_price: number | null
          created_at: string | null
          deleted_at: string | null
          deposit_amount: number | null
          deposit_type: string | null
          description: string | null
          difficulty_level: number | null
          duration_minutes: number | null
          estimated_hours: number | null
          features: string | null
          form_schema: Json | null
          has_variants: boolean | null
          id: string
          is_active: boolean
          is_bookable: boolean | null
          is_public: boolean | null
          legacy_negocio_id: string | null
          max_capacity: number | null
          max_lead_days: number | null
          max_quantity: number | null
          min_notice_minutes: number | null
          min_quantity: number | null
          name: string
          price_variations: Json | null
          priority_level: number | null
          profit_margin: number | null
          required_resource_type: string | null
          requires_confirmation: boolean | null
          requires_diagnosis: boolean | null
          requires_parts: boolean | null
          room_required: boolean | null
          skill_requirements: string[] | null
          tax_rate: number | null
          tools_required: string[] | null
          unit_type: string | null
          updated_at: string | null
          warranty_days: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "services"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_company_id: { Args: never; Returns: string }
      get_user_permissions:
        | {
            Args: { p_company_id: string; p_user_id: string }
            Returns: {
              granted: boolean
              permission: string
            }[]
          }
        | { Args: { user_email: string }; Returns: Json }
      get_user_role: { Args: never; Returns: string }
      get_verifactu_cert_status: {
        Args: { p_company_id: string }
        Returns: Json
      }
      get_verifactu_settings_for_company: {
        Args: { p_company_id: string }
        Returns: Json
      }
      handle_company_registration: {
        Args: {
          p_auth_user_id: string
          p_company_name: string
          p_email: string
          p_full_name: string
        }
        Returns: Json
      }
      has_company_permission: {
        Args: { p_company_id: string; p_roles: string[] }
        Returns: boolean
      }
      initialize_mail_account_folders: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      insert_or_get_address: {
        Args: {
          p_direccion: string
          p_locality_id: string
          p_numero: string
          p_usuario_id: string
        }
        Returns: {
          company_id: string | null
          created_at: string
          direccion: string
          id: string
          locality_id: string | null
          numero: string | null
          piso: string | null
          puerta: string | null
          updated_at: string | null
          usuario_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "addresses"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      insert_or_get_locality: {
        Args: {
          p_country: string
          p_name: string
          p_postal_code: string
          p_province: string
        }
        Returns: {
          country: string | null
          created_at: string
          id: string
          name: string
          postal_code: string | null
          province: string | null
        }
        SetofOptions: {
          from: "*"
          to: "localities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invite_user_to_company:
        | {
            Args: {
              p_company_id: string
              p_email: string
              p_message?: string
              p_role?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_company_id: string
              p_email: string
              p_message?: string
              p_role: string
            }
            Returns: Json
          }
        | {
            Args: { user_email: string; user_name: string; user_role?: string }
            Returns: Json
          }
      invite_user_to_company_debug: {
        Args: { user_email: string; user_name: string; user_role: string }
        Returns: Json
      }
      invoke_process_recurring_quotes: { Args: never; Returns: undefined }
      is_company_admin: { Args: { target_company: string }; Returns: boolean }
      is_company_member: { Args: { p_company_id: string }; Returns: boolean }
      is_dev_user: { Args: { user_email: string }; Returns: boolean }
      is_stage_hidden_for_company: {
        Args: { p_company_id: string; p_stage_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { user_id: string }; Returns: boolean }
      issue_invoice_verifactu: {
        Args: { pdeviceid?: string; pinvoiceid: string; psoftwareid?: string }
        Returns: Json
      }
      join_company_as_member: { Args: { p_company_id: string }; Returns: Json }
      list_company_devices: {
        Args: { p_company_id: string }
        Returns: {
          actual_repair_time: number | null
          ai_confidence_score: number | null
          ai_diagnosis: Json | null
          brand: string
          client_id: string
          color: string | null
          company_id: string
          completed_at: string | null
          condition_on_arrival: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deletion_reason: string | null
          delivered_at: string | null
          device_images: string[] | null
          device_type: string
          estimated_cost: number | null
          estimated_repair_time: number | null
          final_cost: number | null
          id: string
          imei: string | null
          model: string
          operating_system: string | null
          priority: string | null
          purchase_date: string | null
          received_at: string | null
          repair_notes: string[] | null
          reported_issue: string
          serial_number: string | null
          started_repair_at: string | null
          status: string
          storage_capacity: string | null
          updated_at: string | null
          warranty_status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "devices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_company_id: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      log_gdpr_audit: {
        Args: {
          p_action_type: string
          p_new_values?: Json
          p_old_values?: Json
          p_purpose?: string
          p_record_id?: string
          p_subject_email?: string
          p_table_name: string
          p_user_id?: string
        }
        Returns: Json
      }
      mark_client_accessed: {
        Args: { p_client_id: string; p_user_id?: string }
        Returns: undefined
      }
      mark_expired_quotes: { Args: never; Returns: number }
      mark_project_as_read: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      match_product_catalog: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          brand: string
          description: string
          id: string
          model: string
          name: string
          similarity: number
        }[]
      }
      migrate_clients_by_tenant: { Args: never; Returns: string }
      migrate_legacy_clients: { Args: never; Returns: string }
      migrate_legacy_users: { Args: never; Returns: string }
      process_client_consent: {
        Args: {
          p_ip: string
          p_marketing_consent: boolean
          p_token: string
          p_user_agent: string
        }
        Returns: Json
      }
      process_gdpr_deletion_request: {
        Args: {
          p_approve: boolean
          p_processing_user_id?: string
          p_rejection_reason?: string
          p_request_id: string
        }
        Returns: Json
      }
      recompute_ticket_total: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      register_new_owner_from_invite: {
        Args: {
          p_company_name: string
          p_company_nif: string
          p_invitation_token: string
          p_user_name: string
          p_user_surname: string
        }
        Returns: Json
      }
      reject_client_consent: {
        Args: { p_ip: string; p_token: string; p_user_agent: string }
        Returns: Json
      }
      safe_delete_ticket_stage: {
        Args: {
          p_company_id: string
          p_reassign_to?: string
          p_stage_id: string
        }
        Returns: Json
      }
      search_customers: {
        Args: { search_term: string; user_id: string }
        Returns: {
          apellidos: string
          created_at: string
          email: string
          id: string
          nombre: string
          rank: number
          telefono: string
        }[]
      }
      search_customers_dev: {
        Args: { search_term: string; target_user_id: string }
        Returns: {
          apellidos: string
          created_at: string
          email: string
          id: string
          nombre: string
          rank: number
          telefono: string
        }[]
      }
      set_current_company_context: {
        Args: { company_uuid: string }
        Returns: undefined
      }
      sync_client_profile: { Args: never; Returns: Json }
      update_client_consent: {
        Args: {
          p_client_id: string
          p_consent_evidence?: Json
          p_consent_given: boolean
          p_consent_method?: string
          p_consent_type: string
          p_updating_user_id?: string
        }
        Returns: Json
      }
      update_company_user: {
        Args: { p_active?: boolean; p_role?: string; p_user_id: string }
        Returns: Json
      }
      update_customer_dev:
        | {
            Args: {
              customer_id: string
              p_activo?: boolean
              p_apellidos: string
              p_avatar_url?: string
              p_direccion_id?: string
              p_dni?: string
              p_email: string
              p_empresa?: string
              p_fecha_nacimiento?: string
              p_nombre: string
              p_notas?: string
              p_profesion?: string
              p_telefono?: string
              target_user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              customer_id: string
              p_activo?: boolean
              p_avatar_url?: string
              p_direccion_id?: string
              p_dni?: string
              p_email: string
              p_empresa?: string
              p_fecha_nacimiento?: string
              p_nombre: string
              p_notas?: string
              p_profesion?: string
              p_surname: string
              p_telefono?: string
              target_user_id: string
            }
            Returns: boolean
          }
      upsert_client: { Args: { payload: Json }; Returns: Json }
      upsert_user_module:
        | {
            Args: {
              p_module_key: string
              p_status: Database["public"]["Enums"]["module_status"]
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: { p_module_key: string; p_status: string; p_user_id: string }
            Returns: undefined
          }
      upsert_verifactu_settings:
        | {
            Args: {
              p_company_id: string
              p_environment: string
              p_is_active: boolean
              p_issuer_nif: string
              p_software_code: string
              p_software_name: string
              p_software_version: string
            }
            Returns: Json
          }
        | {
            Args: {
              pcert_pem: string
              penvironment: string
              pissuer_nif: string
              pkey_passphrase: string
              pkey_pem: string
              psoftware_code: string
            }
            Returns: Json
          }
      validate_file_path: {
        Args: { company_uuid: string; file_path: string }
        Returns: boolean
      }
      validate_invoice_before_issue: {
        Args: { pinvoiceid: string }
        Returns: Json
      }
      verifactu_log_event: {
        Args: {
          pcompany_id: string
          pevent_type: string
          pinvoice_id: string
          ppayload: Json
        }
        Returns: undefined
      }
      verifactu_preflight_issue: {
        Args: {
          pdevice_id?: string
          pinvoice_id: string
          psoftware_id?: string
        }
        Returns: Json
      }
      verifactu_status: {
        Args: { i: Database["public"]["Tables"]["invoices"]["Row"] }
        Returns: string
      }
    }
    Enums: {
      campaign_status: "draft" | "scheduled" | "sent"
      campaign_trigger_type: "manual" | "birthday" | "inactivity"
      campaign_type: "email" | "whatsapp" | "sms"
      consent_status: "pending" | "accepted" | "rejected" | "revoked"
      content_status:
        | "idea"
        | "copy"
        | "design"
        | "review"
        | "scheduled"
        | "published"
      invitation_status: "not_sent" | "sent" | "opened" | "completed"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "partial"
        | "overdue"
        | "cancelled"
        | "void"
        | "approved"
        | "issued"
        | "rectified"
      invoice_type: "normal" | "simplified" | "rectificative" | "summary"
      lead_source:
        | "web_form"
        | "doctoralia"
        | "top_doctors"
        | "whatsapp"
        | "phone"
        | "referral"
        | "other"
        | "google_ads"
        | "instagram_ads"
        | "tiktok_ads"
        | "email_marketing"
      lead_status:
        | "new"
        | "contacted"
        | "no_answer"
        | "meeting_scheduled"
        | "won"
        | "lost"
      module_status: "activado" | "desactivado" | "en_desarrollo"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "card"
        | "direct_debit"
        | "paypal"
        | "other"
      quote_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "rejected"
        | "expired"
        | "invoiced"
        | "cancelled"
        | "paused"
        | "pending"
        | "request"
        | "active"
      stage_category: "open" | "in_progress" | "completed" | "on_hold"
      waitlist_status:
        | "pending"
        | "notified"
        | "prioritized"
        | "expired"
        | "converted"
      workflow_category: "cancel" | "waiting" | "analysis" | "action" | "final"
    }
    CompositeTypes: {
      note_decrypted: {
        id: string | null
        client_id: string | null
        company_id: string | null
        author_id: string | null
        created_at: string | null
        content: string | null
        author_name: string | null
      }
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
      campaign_status: ["draft", "scheduled", "sent"],
      campaign_trigger_type: ["manual", "birthday", "inactivity"],
      campaign_type: ["email", "whatsapp", "sms"],
      consent_status: ["pending", "accepted", "rejected", "revoked"],
      content_status: [
        "idea",
        "copy",
        "design",
        "review",
        "scheduled",
        "published",
      ],
      invitation_status: ["not_sent", "sent", "opened", "completed"],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "partial",
        "overdue",
        "cancelled",
        "void",
        "approved",
        "issued",
        "rectified",
      ],
      invoice_type: ["normal", "simplified", "rectificative", "summary"],
      lead_source: [
        "web_form",
        "doctoralia",
        "top_doctors",
        "whatsapp",
        "phone",
        "referral",
        "other",
        "google_ads",
        "instagram_ads",
        "tiktok_ads",
        "email_marketing",
      ],
      lead_status: [
        "new",
        "contacted",
        "no_answer",
        "meeting_scheduled",
        "won",
        "lost",
      ],
      module_status: ["activado", "desactivado", "en_desarrollo"],
      payment_method: [
        "cash",
        "bank_transfer",
        "card",
        "direct_debit",
        "paypal",
        "other",
      ],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "rejected",
        "expired",
        "invoiced",
        "cancelled",
        "paused",
        "pending",
        "request",
        "active",
      ],
      stage_category: ["open", "in_progress", "completed", "on_hold"],
      waitlist_status: [
        "pending",
        "notified",
        "prioritized",
        "expired",
        "converted",
      ],
      workflow_category: ["cancel", "waiting", "analysis", "action", "final"],
    },
  },
} as const
