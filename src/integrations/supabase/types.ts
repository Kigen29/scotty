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
      ab_tests: {
        Row: {
          campaign_a_id: string | null
          campaign_b_id: string | null
          created_at: string
          id: string
          lead_id: string
          status: string
          updated_at: string
          user_id: string
          winner: string | null
        }
        Insert: {
          campaign_a_id?: string | null
          campaign_b_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          status?: string
          updated_at?: string
          user_id: string
          winner?: string | null
        }
        Update: {
          campaign_a_id?: string | null
          campaign_b_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_tests_campaign_a_id_fkey"
            columns: ["campaign_a_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_tests_campaign_b_id_fkey"
            columns: ["campaign_b_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_tests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_suggested_reply: string | null
          created_at: string
          direction: string
          id: string
          lead_id: string
          message: string
          user_id: string
        }
        Insert: {
          ai_suggested_reply?: string | null
          created_at?: string
          direction: string
          id?: string
          lead_id: string
          message: string
          user_id: string
        }
        Update: {
          ai_suggested_reply?: string | null
          created_at?: string
          direction?: string
          id?: string
          lead_id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          ab_test_id: string | null
          ab_variant: string | null
          body: string
          channel: string | null
          created_at: string
          id: string
          lead_id: string
          opened_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          source: string | null
          status: string
          subject: string
          template_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ab_test_id?: string | null
          ab_variant?: string | null
          body: string
          channel?: string | null
          created_at?: string
          id?: string
          lead_id: string
          opened_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          source?: string | null
          status?: string
          subject: string
          template_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ab_test_id?: string | null
          ab_variant?: string | null
          body?: string
          channel?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          opened_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          source?: string | null
          status?: string
          subject?: string
          template_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_ab_test_id_fkey"
            columns: ["ab_test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_profiles: {
        Row: {
          created_at: string
          has_website_preference: string | null
          id: string
          industries: string[]
          is_active: boolean
          locations: string[]
          name: string
          pain_points: string[]
          size_range: string | null
          updated_at: string
          user_id: string
          weight_has_email: number
          weight_industry: number
          weight_location: number
          weight_no_website: number
        }
        Insert: {
          created_at?: string
          has_website_preference?: string | null
          id?: string
          industries?: string[]
          is_active?: boolean
          locations?: string[]
          name?: string
          pain_points?: string[]
          size_range?: string | null
          updated_at?: string
          user_id: string
          weight_has_email?: number
          weight_industry?: number
          weight_location?: number
          weight_no_website?: number
        }
        Update: {
          created_at?: string
          has_website_preference?: string | null
          id?: string
          industries?: string[]
          is_active?: boolean
          locations?: string[]
          name?: string
          pain_points?: string[]
          size_range?: string | null
          updated_at?: string
          user_id?: string
          weight_has_email?: number
          weight_industry?: number
          weight_location?: number
          weight_no_website?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          analysis: Json | null
          assigned_to: string | null
          business_name: string
          category: string | null
          contact_channels: Json | null
          created_at: string
          discovered_at: string
          discovery_source: string | null
          email: string | null
          email_verification_status: string | null
          email_verified: boolean | null
          has_website: boolean | null
          icp_score: number | null
          id: string
          location: string | null
          notes: string | null
          phone: string | null
          priority_score: number | null
          social_links: Json | null
          status: string
          unsubscribed: boolean | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          analysis?: Json | null
          assigned_to?: string | null
          business_name: string
          category?: string | null
          contact_channels?: Json | null
          created_at?: string
          discovered_at?: string
          discovery_source?: string | null
          email?: string | null
          email_verification_status?: string | null
          email_verified?: boolean | null
          has_website?: boolean | null
          icp_score?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          phone?: string | null
          priority_score?: number | null
          social_links?: Json | null
          status?: string
          unsubscribed?: boolean | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          analysis?: Json | null
          assigned_to?: string | null
          business_name?: string
          category?: string | null
          contact_channels?: Json | null
          created_at?: string
          discovered_at?: string
          discovery_source?: string | null
          email?: string | null
          email_verification_status?: string | null
          email_verified?: boolean | null
          has_website?: boolean | null
          icp_score?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          phone?: string | null
          priority_score?: number | null
          social_links?: Json | null
          status?: string
          unsubscribed?: boolean | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      meetings: {
        Row: {
          booking_link: string | null
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_link?: string | null
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_link?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sequence_enrollments: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          lead_id: string
          next_step_at: string | null
          sequence_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          lead_id: string
          next_step_at?: string | null
          sequence_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          lead_id?: string
          next_step_at?: string | null
          sequence_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          steps: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          steps?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          steps?: Json
          user_id?: string
        }
        Relationships: []
      }
      sequences: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          steps: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          steps?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          steps?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          active_hours_end: string | null
          active_hours_start: string | null
          booking_link: string | null
          company_name: string | null
          company_website: string | null
          created_at: string
          daily_send_limit: number | null
          discovery_pipeline: string | null
          email_signature: string | null
          follow_up_intervals: number[] | null
          id: string
          is_autonomous: boolean | null
          portfolio_links: string[] | null
          portfolio_projects: Json | null
          sender_email: string | null
          services: string[] | null
          social_discovery_enabled: boolean | null
          target_categories: string[] | null
          target_locations: string[] | null
          updated_at: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          active_hours_end?: string | null
          active_hours_start?: string | null
          booking_link?: string | null
          company_name?: string | null
          company_website?: string | null
          created_at?: string
          daily_send_limit?: number | null
          discovery_pipeline?: string | null
          email_signature?: string | null
          follow_up_intervals?: number[] | null
          id?: string
          is_autonomous?: boolean | null
          portfolio_links?: string[] | null
          portfolio_projects?: Json | null
          sender_email?: string | null
          services?: string[] | null
          social_discovery_enabled?: boolean | null
          target_categories?: string[] | null
          target_locations?: string[] | null
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          active_hours_end?: string | null
          active_hours_start?: string | null
          booking_link?: string | null
          company_name?: string | null
          company_website?: string | null
          created_at?: string
          daily_send_limit?: number | null
          discovery_pipeline?: string | null
          email_signature?: string | null
          follow_up_intervals?: number[] | null
          id?: string
          is_autonomous?: boolean | null
          portfolio_links?: string[] | null
          portfolio_projects?: Json | null
          sender_email?: string | null
          services?: string[] | null
          social_discovery_enabled?: boolean | null
          target_categories?: string[] | null
          target_locations?: string[] | null
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_code: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_code?: string
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cron_headers: { Args: never; Returns: Json }
      get_user_team_id: { Args: { _user_id: string }; Returns: string }
      has_team_role: {
        Args: {
          _role: Database["public"]["Enums"]["team_role"]
          _team_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      team_role: "owner" | "admin" | "member"
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
      team_role: ["owner", "admin", "member"],
    },
  },
} as const
