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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      interview_questions: {
        Row: {
          clarity: string | null
          communication_quality: string | null
          confidence_level: string | null
          created_at: string
          feedback: string | null
          filler_words: Json | null
          id: string
          question_number: number
          question_text: string
          question_type: string
          score: number | null
          sentiment: string | null
          session_id: string
          technical_depth: string | null
          transcript: string | null
          user_id: string
        }
        Insert: {
          clarity?: string | null
          communication_quality?: string | null
          confidence_level?: string | null
          created_at?: string
          feedback?: string | null
          filler_words?: Json | null
          id?: string
          question_number: number
          question_text: string
          question_type?: string
          score?: number | null
          sentiment?: string | null
          session_id: string
          technical_depth?: string | null
          transcript?: string | null
          user_id: string
        }
        Update: {
          clarity?: string | null
          communication_quality?: string | null
          confidence_level?: string | null
          created_at?: string
          feedback?: string | null
          filler_words?: Json | null
          id?: string
          question_number?: number
          question_text?: string
          question_type?: string
          score?: number | null
          sentiment?: string | null
          session_id?: string
          technical_depth?: string | null
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          communication_score: number | null
          completed_at: string | null
          confidence_score: number | null
          created_at: string
          final_feedback: string | null
          id: string
          improvement_tips: Json | null
          overall_score: number | null
          resume_analysis_id: string | null
          resume_match_score: number | null
          status: string
          technical_score: number | null
          user_id: string
        }
        Insert: {
          communication_score?: number | null
          completed_at?: string | null
          confidence_score?: number | null
          created_at?: string
          final_feedback?: string | null
          id?: string
          improvement_tips?: Json | null
          overall_score?: number | null
          resume_analysis_id?: string | null
          resume_match_score?: number | null
          status?: string
          technical_score?: number | null
          user_id: string
        }
        Update: {
          communication_score?: number | null
          completed_at?: string | null
          confidence_score?: number | null
          created_at?: string
          final_feedback?: string | null
          id?: string
          improvement_tips?: Json | null
          overall_score?: number | null
          resume_analysis_id?: string | null
          resume_match_score?: number | null
          status?: string
          technical_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_sessions_resume_analysis_id_fkey"
            columns: ["resume_analysis_id"]
            isOneToOne: false
            referencedRelation: "resume_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_analyses: {
        Row: {
          ats_optimization: number | null
          created_at: string
          file_name: string
          file_path: string | null
          id: string
          improvements: Json | null
          project_impact: number | null
          resume_text: string | null
          score: number | null
          self_introduction: string | null
          skills_strength: number | null
          technical_depth: number | null
          user_id: string
        }
        Insert: {
          ats_optimization?: number | null
          created_at?: string
          file_name: string
          file_path?: string | null
          id?: string
          improvements?: Json | null
          project_impact?: number | null
          resume_text?: string | null
          score?: number | null
          self_introduction?: string | null
          skills_strength?: number | null
          technical_depth?: number | null
          user_id: string
        }
        Update: {
          ats_optimization?: number | null
          created_at?: string
          file_name?: string
          file_path?: string | null
          id?: string
          improvements?: Json | null
          project_impact?: number | null
          resume_text?: string | null
          score?: number | null
          self_introduction?: string | null
          skills_strength?: number | null
          technical_depth?: number | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
