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
      agents: {
        Row: {
          agent_version: string | null
          created_at: string
          id: string
          install_error: string | null
          installed_at: string | null
          last_seen_at: string | null
          name: string
          platform: string | null
          plugin_status: string | null
          revoked_at: string | null
          token_hash: string
          token_prefix: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_version?: string | null
          created_at?: string
          id?: string
          install_error?: string | null
          installed_at?: string | null
          last_seen_at?: string | null
          name: string
          platform?: string | null
          plugin_status?: string | null
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_version?: string | null
          created_at?: string
          id?: string
          install_error?: string | null
          installed_at?: string | null
          last_seen_at?: string | null
          name?: string
          platform?: string | null
          plugin_status?: string | null
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_pairing_codes: {
        Row: {
          agent_id: string | null
          agent_name: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          target_agent_id: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          target_agent_id?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          target_agent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pairing_codes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pairing_codes_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          external_id: string | null
          id: string
          meta: Json | null
          role: string
          seq: number | null
          session_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          external_id?: string | null
          id?: string
          meta?: Json | null
          role?: string
          seq?: number | null
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          external_id?: string | null
          id?: string
          meta?: Json | null
          role?: string
          seq?: number | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      replies: {
        Row: {
          content: string
          created_at: string
          delivered_at: string | null
          id: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replies_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          agent_id: string
          created_at: string
          cwd: string | null
          detection_confidence: string | null
          detection_source: string | null
          ended_at: string | null
          external_id: string
          id: string
          ide: string | null
          last_activity_at: string
          pid: number | null
          source: string
          started_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          cwd?: string | null
          detection_confidence?: string | null
          detection_source?: string | null
          ended_at?: string | null
          external_id: string
          id?: string
          ide?: string | null
          last_activity_at?: string
          pid?: number | null
          source?: string
          started_at?: string | null
          status?: string
          title?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          cwd?: string | null
          detection_confidence?: string | null
          detection_source?: string | null
          ended_at?: string | null
          external_id?: string
          id?: string
          ide?: string | null
          last_activity_at?: string
          pid?: number | null
          source?: string
          started_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_agent_pairing: {
        Args: {
          p_agent_name: string
          p_code_hash: string
          p_target_agent_id?: string | null
        }
        Returns: {
          expires_at: string
          pairing_id: string
        }[]
      }
      consume_agent_pairing: {
        Args: {
          p_code_hash: string
          p_platform?: string
          p_token_hash: string
          p_token_prefix: string
          p_version?: string
        }
        Returns: {
          agent_id: string
          pairing_id: string
          repaired: boolean
        }[]
      }
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
