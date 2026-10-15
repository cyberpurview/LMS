export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      categories: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          course_id: string | null
          quiz_id: string | null
          course_title: string
          id: string
          issued_at: string
          learner_id: string
          learner_name: string
        }
        Insert: {
          course_id?: string | null
          quiz_id?: string | null
          course_title: string
          id?: string
          issued_at?: string
          learner_id: string
          learner_name: string
        }
        Update: {
          course_id?: string | null
          quiz_id?: string | null
          course_title?: string
          id?: string
          issued_at?: string
          learner_id?: string
          learner_name?: string
        }
        Relationships: [
          {
            foreignKeyName: 'certificates_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'certificates_learner_id_fkey'
            columns: ['learner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      courses: {
        Row: {
          slug: string
          completion_rule: string
          certificate_mode: string
          require_assessment: boolean
          category: string
          created_at: string
          description: string
          duration: number
          id: string
          level: string
          price: number
          search_document: unknown
          status: string
          tags: string[]
          thumbnail: string
          title: string
          tutor_id: string
          updated_at: string
        }
        Insert: {
          slug?: string
          completion_rule?: string
          certificate_mode?: string
          require_assessment?: boolean
          category: string
          created_at?: string
          description: string
          duration?: number
          id?: string
          level: string
          price?: number
          search_document?: unknown
          status?: string
          tags?: string[]
          thumbnail?: string
          title: string
          tutor_id: string
          updated_at?: string
        }
        Update: {
          slug?: string
          completion_rule?: string
          certificate_mode?: string
          require_assessment?: boolean
          category?: string
          created_at?: string
          description?: string
          duration?: number
          id?: string
          level?: string
          price?: number
          search_document?: unknown
          status?: string
          tags?: string[]
          thumbnail?: string
          title?: string
          tutor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'courses_category_fkey'
            columns: ['category']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['name']
          },
          {
            foreignKeyName: 'courses_tutor_id_fkey'
            columns: ['tutor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      enrollments: {
        Row: {
          completed_at: string | null
          course_id: string
          enrolled_at: string
          id: string
          last_accessed_at: string
          learner_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          enrolled_at?: string
          id?: string
          last_accessed_at?: string
          learner_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          enrolled_at?: string
          id?: string
          last_accessed_at?: string
          learner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'enrollments_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'enrollments_learner_id_fkey'
            columns: ['learner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      lesson_notes: {
        Row: {
          body: string
          learner_id: string
          lesson_id: string
          updated_at: string
        }
        Insert: {
          body: string
          learner_id: string
          lesson_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          learner_id?: string
          lesson_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lesson_notes_learner_id_fkey'
            columns: ['learner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lesson_notes_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'lessons'
            referencedColumns: ['id']
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string
          learner_id: string
          lesson_id: string
        }
        Insert: {
          completed_at?: string
          learner_id: string
          lesson_id: string
        }
        Update: {
          completed_at?: string
          learner_id?: string
          lesson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lesson_progress_learner_id_fkey'
            columns: ['learner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lesson_progress_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'lessons'
            referencedColumns: ['id']
          },
        ]
      }
      lessons: {
        Row: {
          content: string
          duration: number
          id: string
          module_id: string
          position: number
          title: string
          type: string
          video_url: string
        }
        Insert: {
          content?: string
          duration?: number
          id?: string
          module_id: string
          position: number
          title: string
          type: string
          video_url?: string
        }
        Update: {
          content?: string
          duration?: number
          id?: string
          module_id?: string
          position?: number
          title?: string
          type?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lessons_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'modules'
            referencedColumns: ['id']
          },
        ]
      }
      modules: {
        Row: {
          course_id: string
          id: string
          position: number
          title: string
        }
        Insert: {
          course_id: string
          id?: string
          position: number
          title: string
        }
        Update: {
          course_id?: string
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'modules_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          href: string
          event_key: string | null
          category: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          href?: string
          event_key?: string | null
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          href?: string
          event_key?: string | null
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      platform_settings: {
        Row: {
          certificate_enabled: boolean
          enrollment_open: boolean
          platform_name: string
          singleton: boolean
        }
        Insert: {
          certificate_enabled?: boolean
          enrollment_open?: boolean
          platform_name?: string
          singleton?: boolean
        }
        Update: {
          certificate_enabled?: boolean
          enrollment_open?: boolean
          platform_name?: string
          singleton?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          preferences: Json
          role: Database['public']['Enums']['lms_role']
        }
        Insert: {
          avatar?: string
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          name: string
          preferences?: Json
          role?: Database['public']['Enums']['lms_role']
        }
        Update: {
          avatar?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          preferences?: Json
          role?: Database['public']['Enums']['lms_role']
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          answers: Json | null
          feedback: Json
          id: string
          learner_id: string
          passed: boolean | null
          quiz_id: string
          score: number | null
          started_at: string
          submitted_at: string | null
          version: number
        }
        Insert: {
          answers?: Json | null
          feedback?: Json
          id?: string
          learner_id: string
          passed?: boolean | null
          quiz_id: string
          score?: number | null
          started_at?: string
          submitted_at?: string | null
          version: number
        }
        Update: {
          answers?: Json | null
          feedback?: Json
          id?: string
          learner_id?: string
          passed?: boolean | null
          quiz_id?: string
          score?: number | null
          started_at?: string
          submitted_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_attempts_learner_id_fkey'
            columns: ['learner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_attempts_quiz_id_fkey'
            columns: ['quiz_id']
            isOneToOne: false
            referencedRelation: 'quizzes'
            referencedColumns: ['id']
          },
        ]
      }
      quiz_questions: {
        Row: {
          id: string
          options: Json
          position: number
          quiz_id: string
          text: string
        }
        Insert: {
          id?: string
          options: Json
          position: number
          quiz_id: string
          text: string
        }
        Update: {
          id?: string
          options?: Json
          position?: number
          quiz_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_questions_quiz_id_fkey'
            columns: ['quiz_id']
            isOneToOne: false
            referencedRelation: 'quizzes'
            referencedColumns: ['id']
          },
        ]
      }
      quizzes: {
        Row: {
          purpose: string
          max_attempts: number | null
          retry_delay_minutes: number
          feedback_policy: string
          price: number
          creator_id: string
          certificate_rule: string
          certificate_mode: string
          thumbnail_path: string
          status: string
          course_id: string | null
          id: string
          passing_score: number
          time_limit: number
          title: string
          version: number
        }
        Insert: {
          purpose?: string
          max_attempts?: number | null
          retry_delay_minutes?: number
          feedback_policy?: string
          price?: number
          creator_id: string
          certificate_rule?: string
          certificate_mode?: string
          thumbnail_path?: string
          status?: string
          course_id?: string | null
          id?: string
          passing_score: number
          time_limit: number
          title: string
          version?: number
        }
        Update: {
          purpose?: string
          max_attempts?: number | null
          retry_delay_minutes?: number
          feedback_policy?: string
          price?: number
          creator_id?: string
          certificate_rule?: string
          certificate_mode?: string
          thumbnail_path?: string
          status?: string
          course_id?: string | null
          id?: string
          passing_score?: number
          time_limit?: number
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'quizzes_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'support_tickets_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      quiz_result: { Args: { quiz_id: string }; Returns: Json }
      quiz_attempt_action: {
        Args: {
          action: string
          quiz_id: string
          learner_id?: string
          extra?: number
          reason?: string
          request_id?: string
          after_id?: string
        }
        Returns: Json
      }
      ai_course_command: { Args: { action: string; payload?: Json }; Returns: Json }
      claim_ai_course_work: {
        Args: { model_name: string; daily_request_limit?: number }
        Returns: Json
      }
      finish_ai_course_work: {
        Args: {
          job_id: string
          lease: string
          result: Json
          error_message?: string | null
          permanent?: boolean
        }
        Returns: undefined
      }
      create_quiz_order: { Args: { quiz_id: string }; Returns: Json }
      bind_purchase_checkout: {
        Args: { order_id: string; checkout_id: string }
        Returns: undefined
      }
      fulfill_purchase_order: {
        Args: {
          order_id: string
          checkout_id: string
          payment_id: string
          amount_minor: number
          currency: string
          paid_at: string
        }
        Returns: string
      }
      create_course_order: { Args: { course_id: string }; Returns: Json }
      bind_course_checkout: { Args: { order_id: string; checkout_id: string }; Returns: undefined }
      fulfill_course_order: {
        Args: {
          order_id: string
          checkout_id: string
          payment_id: string
          amount_minor: number
          currency: string
          paid_at: string
        }
        Returns: string
      }
      course_overviews: { Args: { course_ids: string[] }; Returns: Json }
      claim_course_resource_cleanup: { Args: Record<string, never>; Returns: Json }
      finish_course_resource_cleanup: { Args: { paths: string[] }; Returns: undefined }
      course_upload_guard: { Args: { course_id: string }; Returns: undefined }
      claim_notification_emails: { Args: Record<string, never>; Returns: Json }
      finish_notification_email: {
        Args: { email_id: string; delivered: boolean }
        Returns: undefined
      }
      notification_feed: {
        Args: { before_time?: string; before_id?: string; unread_only?: boolean }
        Returns: Json
      }
      save_course_with_revision: { Args: { payload: Json }; Returns: Json }
      lesson_resource_command: {
        Args: { action: string; payload: Json }
        Returns: Json
      }
      quiz_authoring_info: {
        Args: { quiz_ids: string[] }
        Returns: Json
      }
      complete_lesson: { Args: { lesson_id: string }; Returns: undefined }
      course_outlines: { Args: { course_ids: string[] }; Returns: Json }
      enroll_course: { Args: { course_id: string }; Returns: string }
      email_change_quota: { Args: { operation: string }; Returns: undefined }
      authorize_email_change: { Args: { user_id: string; new_email: string }; Returns: undefined }
      cancel_email_change: { Args: { user_id: string }; Returns: undefined }
      award_action: {
        Args: { action: string; kind: string; subject_id: string; learner_id?: string }
        Returns: Json
      }
      browse_courses: {
        Args: {
          mode: string
          after_id?: string
          page_size: number
          search: string
          category_filter: string
          level_filter: string
          state_filter: string
        }
        Returns: Json
      }
      claim_course_certificate: { Args: { course_id: string }; Returns: string }
      enrollment_summaries: {
        Args: { enrollment_ids: string[] }
        Returns: Json
      }
      lms_command: {
        Args: { command: string; payload: Json }
        Returns: undefined
      }
      quiz_editor_keys: { Args: { quiz_id: string }; Returns: Json }
      quiz_editor_keys_bulk: { Args: { quiz_ids: string[] }; Returns: Json }
      quiz_summaries: { Args: { quiz_ids: string[] }; Returns: Json }
      start_quiz: { Args: { quiz_id: string }; Returns: Json }
      submit_quiz: {
        Args: { answers: Json; attempt_id: string }
        Returns: Json
      }
      verify_certificate: { Args: { certificate_id: string }; Returns: Json }
      workspace_summary: { Args: never; Returns: Json }
    }
    Enums: {
      lms_role: 'admin' | 'tutor' | 'learner'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lms_role: ['admin', 'tutor', 'learner'],
    },
  },
} as const
