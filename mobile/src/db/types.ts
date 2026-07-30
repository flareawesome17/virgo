/**
 * Database types — GENERATED from supabase/migrations. Do not edit by hand.
 *
 * Regenerated whenever a migration is added, so this always matches what is actually in the
 * database. Anything written here by hand is lost on the next migration.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      albums: {
        Row: {
          id: string;
          user_id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          cover_url: string | null;
          item_count: number;
          status: string;
          created_at: string;
          updated_at: string;
          retention_days: number | null;
        };
        Insert: {
          id: string;
          user_id?: string;
          workspace_id: string;
          name: string;
          description?: string | null;
          cover_url?: string | null;
          item_count?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          retention_days?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          name?: string;
          description?: string | null;
          cover_url?: string | null;
          item_count?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          retention_days?: number | null;
        };
      };
      collaborators: {
        Row: {
          id: string;
          user_id: string;
          workspace_id: string;
          name: string;
          avatar_url: string | null;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id?: string;
          workspace_id: string;
          name: string;
          avatar_url?: string | null;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          name?: string;
          avatar_url?: string | null;
          role?: string;
          created_at?: string;
        };
      };
      friends: {
        Row: {
          id: string;
          user_id: string;
          friend_name: string;
          friend_email: string | null;
          friend_avatar_url: string | null;
          status: string;
          requested_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id?: string;
          friend_name: string;
          friend_email?: string | null;
          friend_avatar_url?: string | null;
          status?: string;
          requested_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          friend_name?: string;
          friend_email?: string | null;
          friend_avatar_url?: string | null;
          status?: string;
          requested_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          schedule_event_id: string | null;
          title: string;
          description: string | null;
          reminder_time: string;
          is_alarm_enabled: boolean;
          has_push_notification: boolean;
          is_completed: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id?: string;
          schedule_event_id?: string | null;
          title: string;
          description?: string | null;
          reminder_time: string;
          is_alarm_enabled?: boolean;
          has_push_notification?: boolean;
          is_completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          schedule_event_id?: string | null;
          title?: string;
          description?: string | null;
          reminder_time?: string;
          is_alarm_enabled?: boolean;
          has_push_notification?: boolean;
          is_completed?: boolean;
          created_at?: string;
        };
      };
      schedule_events: {
        Row: {
          id: string;
          user_id: string;
          workspace_id: string | null;
          title: string;
          description: string | null;
          event_date: string;
          event_time: string | null;
          event_type: string;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id?: string;
          workspace_id?: string | null;
          title: string;
          description?: string | null;
          event_date: string;
          event_time?: string | null;
          event_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          workspace_id?: string | null;
          title?: string;
          description?: string | null;
          event_date?: string;
          event_time?: string | null;
          event_type?: string;
          created_at?: string;
        };
      };
      workspaces: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          accent_color: string;
          media_count: number;
          collaborator_count: number;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id?: string;
          name: string;
          description?: string | null;
          accent_color?: string;
          media_count?: number;
          collaborator_count?: number;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          accent_color?: string;
          media_count?: number;
          collaborator_count?: number;
          updated_at?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export type Album = Database['public']['Tables']['albums']['Row'];
export type Collaborator = Database['public']['Tables']['collaborators']['Row'];
export type Friend = Database['public']['Tables']['friends']['Row'];
export type Reminder = Database['public']['Tables']['reminders']['Row'];
export type ScheduleEvent = Database['public']['Tables']['schedule_events']['Row'];
export type Workspace = Database['public']['Tables']['workspaces']['Row'];
