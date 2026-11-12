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
      access_operations: {
        Row: {
          attempts: number
          created_at: string
          dispatch_request_id: number | null
          executed_at: string | null
          external_operation_id: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          member_id: string
          next_retry_at: string | null
          operation_type: string
          status: string
          updated_at: string
          whatsapp_group_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dispatch_request_id?: number | null
          executed_at?: string | null
          external_operation_id?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          member_id: string
          next_retry_at?: string | null
          operation_type: string
          status?: string
          updated_at?: string
          whatsapp_group_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dispatch_request_id?: number | null
          executed_at?: string | null
          external_operation_id?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          member_id?: string
          next_retry_at?: string | null
          operation_type?: string
          status?: string
          updated_at?: string
          whatsapp_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_operations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_operations_whatsapp_group_id_fkey"
            columns: ["whatsapp_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          member_id: string | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          member_id?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          member_id?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          influencer_name: string | null
          name: string
          slug: string
          status: string
          updated_at: string
          whatsapp_community_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          influencer_name?: string | null
          name: string
          slug: string
          status?: string
          updated_at?: string
          whatsapp_community_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          influencer_name?: string | null
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          whatsapp_community_id?: string | null
        }
        Relationships: []
      }
      group_memberships: {
        Row: {
          created_at: string
          external_participant_id: string | null
          id: string
          invited_at: string | null
          joined_at: string | null
          last_synced_at: string | null
          member_id: string
          removed_at: string | null
          status: string
          updated_at: string
          whatsapp_group_id: string
        }
        Insert: {
          created_at?: string
          external_participant_id?: string | null
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          last_synced_at?: string | null
          member_id: string
          removed_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_group_id: string
        }
        Update: {
          created_at?: string
          external_participant_id?: string | null
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          last_synced_at?: string | null
          member_id?: string
          removed_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_whatsapp_group_id_fkey"
            columns: ["whatsapp_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      interests: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      member_interests: {
        Row: {
          created_at: string
          interest_id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          interest_id: string
          member_id: string
        }
        Update: {
          created_at?: string
          interest_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_interests_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_interests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          city: string | null
          country: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string
          phone_e164: string
          privacy_consent_at: string | null
          province: string | null
          registration_source: string
          status: string
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone: string
          phone_e164: string
          privacy_consent_at?: string | null
          province?: string | null
          registration_source?: string
          status?: string
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string
          phone_e164?: string
          privacy_consent_at?: string | null
          province?: string | null
          registration_source?: string
          status?: string
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          member_id: string | null
          message: string
          metadata: Json
          notification_type: string
          sent_at: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          member_id?: string | null
          message: string
          metadata?: Json
          notification_type: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          member_id?: string | null
          message?: string
          metadata?: Json
          notification_type?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          external_event_id: string | null
          id: string
          payload: Json
          payment_id: string
          processed_at: string | null
          source: string
        }
        Insert: {
          created_at?: string
          event_type: string
          external_event_id?: string | null
          id?: string
          payload?: Json
          payment_id: string
          processed_at?: string | null
          source: string
        }
        Update: {
          created_at?: string
          event_type?: string
          external_event_id?: string | null
          id?: string
          payload?: Json
          payment_id?: string
          processed_at?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          member_id: string
          metadata: Json
          paid_at: string | null
          payment_method: string | null
          payment_reference: string
          payment_type: string
          proof_path: string | null
          provider: string
          provider_reference: string | null
          rejection_reason: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          member_id: string
          metadata?: Json
          paid_at?: string | null
          payment_method?: string | null
          payment_reference: string
          payment_type: string
          proof_path?: string | null
          provider?: string
          provider_reference?: string | null
          rejection_reason?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          member_id?: string
          metadata?: Json
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string
          payment_type?: string
          proof_path?: string | null
          provider?: string
          provider_reference?: string | null
          rejection_reason?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          community_id: string
          created_at: string
          currency: string
          description: string | null
          duration_days: number
          grace_days: number
          id: string
          initial_price: number
          is_active: boolean
          name: string
          renewal_price: number
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number
          grace_days?: number
          id?: string
          initial_price?: number
          is_active?: boolean
          name: string
          renewal_price?: number
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number
          grace_days?: number
          id?: string
          initial_price?: number
          is_active?: boolean
          name?: string
          renewal_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          activated_at: string | null
          community_id: string
          created_at: string
          ended_at: string | null
          expires_at: string | null
          grace_ends_at: string | null
          id: string
          member_id: string
          plan_id: string
          starts_at: string | null
          status: string
          updated_at: string
          whatsapp_activated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          community_id: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string | null
          grace_ends_at?: string | null
          id?: string
          member_id: string
          plan_id: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_activated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          community_id?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string | null
          grace_ends_at?: string | null
          id?: string
          member_id?: string
          plan_id?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_activated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_login_at: string | null
          name: string
          password: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          name: string
          password: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          name?: string
          password?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          event_type: string
          external_event_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          processing_status: string
          provider: string
          signature_valid: boolean
        }
        Insert: {
          created_at?: string
          event_type: string
          external_event_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider: string
          signature_valid?: boolean
        }
        Update: {
          created_at?: string
          event_type?: string
          external_event_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
          signature_valid?: boolean
        }
        Relationships: []
      }
      whatsapp_connections: {
        Row: {
          community_id: string
          connection_status: string
          created_at: string
          id: string
          last_connected_at: string | null
          last_disconnected_at: string | null
          last_error: string | null
          name: string
          provider: string
          session_reference: string | null
          updated_at: string
        }
        Insert: {
          community_id: string
          connection_status?: string
          created_at?: string
          id?: string
          last_connected_at?: string | null
          last_disconnected_at?: string | null
          last_error?: string | null
          name: string
          provider?: string
          session_reference?: string | null
          updated_at?: string
        }
        Update: {
          community_id?: string
          connection_status?: string
          created_at?: string
          id?: string
          last_connected_at?: string | null
          last_disconnected_at?: string | null
          last_error?: string | null
          name?: string
          provider?: string
          session_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          community_id: string
          created_at: string
          description: string | null
          external_group_id: string
          group_type: string
          id: string
          image_url: string | null
          invite_link: string | null
          is_active: boolean
          linked_parent_id: string | null
          name: string
          sync_status: string
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          community_id: string
          created_at?: string
          description?: string | null
          external_group_id: string
          group_type?: string
          id?: string
          image_url?: string | null
          invite_link?: string | null
          is_active?: boolean
          linked_parent_id?: string | null
          name: string
          sync_status?: string
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          community_id?: string
          created_at?: string
          description?: string | null
          external_group_id?: string
          group_type?: string
          id?: string
          image_url?: string | null
          invite_link?: string | null
          is_active?: boolean
          linked_parent_id?: string | null
          name?: string
          sync_status?: string
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          external_group_id: string
          participant_phone: string
          processed_at: string | null
          received_at: string
          result: Json
        }
        Insert: {
          event_id: string
          event_type: string
          external_group_id: string
          participant_phone: string
          processed_at?: string | null
          received_at?: string
          result?: Json
        }
        Update: {
          event_id?: string
          event_type?: string
          external_group_id?: string
          participant_phone?: string
          processed_at?: string | null
          received_at?: string
          result?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_whatsapp_community: {
        Args: { p_community_id: string }
        Returns: Json
      }
      archive_whatsapp_group: { Args: { p_group_id: string }; Returns: Json }
      confirm_whatsapp_participant: {
        Args: {
          p_event_id: string
          p_external_group_id: string
          p_occurred_at?: string
          p_participant_phone: string
        }
        Returns: Json
      }
      dispatch_whatsapp_access_worker: { Args: never; Returns: undefined }
      enqueue_expired_whatsapp_removals: { Args: never; Returns: Json }
      finalize_subscription_expiry: {
        Args: { p_subscription_id: string }
        Returns: boolean
      }
      get_whatsapp_webhook_secret: { Args: never; Returns: string }
      process_pending_whatsapp_adds: {
        Args: { p_operation_id?: string }
        Returns: number
      }
      reconcile_whatsapp_access_errors: { Args: never; Returns: number }
      run_whatsapp_access_worker: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
