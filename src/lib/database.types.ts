/**
 * Hand-written mirror of the schema in supabase/migrations/20260818120000_backend_foundation.sql.
 * Shaped to match what `supabase gen types typescript` produces, so it's a drop-in
 * replacement once the project is linked and types can be generated for real.
 */

export type UserRole = 'admin' | 'student';
export type PostChannel = 'official' | 'students';
export type AttachmentKind = 'none' | 'image' | 'video' | 'pdf' | 'poll' | 'chart';
export type MessageKind = 'text' | 'image' | 'pdf' | 'chart' | 'voice';
export type NotificationKind = 'signal' | 'chat' | 'like' | 'comment' | 'target' | 'session';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          role: UserRole;
          reveal_identity: boolean;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          phone?: string | null;
          role?: UserRole;
          reveal_identity?: boolean;
          avatar_url?: string | null;
        };
        Update: {
          full_name?: string;
          phone?: string | null;
          role?: UserRole;
          reveal_identity?: boolean;
          avatar_url?: string | null;
        };
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          channel: PostChannel;
          title: string | null;
          body: string | null;
          instrument: string | null;
          entry_price: number | null;
          stop_loss: number | null;
          take_profit: number | null;
          attachment: AttachmentKind;
          attachment_url: string | null;
          chart_seed: number | null;
          is_anonymous: boolean;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          channel?: PostChannel;
          title?: string | null;
          body?: string | null;
          instrument?: string | null;
          entry_price?: number | null;
          stop_loss?: number | null;
          take_profit?: number | null;
          attachment?: AttachmentKind;
          attachment_url?: string | null;
          chart_seed?: number | null;
          is_anonymous?: boolean;
        };
        Update: {
          title?: string | null;
          body?: string | null;
          instrument?: string | null;
          entry_price?: number | null;
          stop_loss?: number | null;
          take_profit?: number | null;
          attachment?: AttachmentKind;
          attachment_url?: string | null;
          chart_seed?: number | null;
          is_anonymous?: boolean;
        };
      };
      comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          body: string | null;
          voice_url: string | null;
          voice_duration_seconds: number | null;
          is_anonymous: boolean;
          display_name: string;
          created_at: string;
        };
        Insert: {
          post_id: string;
          author_id: string;
          body?: string | null;
          voice_url?: string | null;
          voice_duration_seconds?: number | null;
          is_anonymous?: boolean;
        };
        Update: {
          body?: string | null;
          voice_url?: string | null;
          voice_duration_seconds?: number | null;
        };
      };
      likes: {
        Row: {
          post_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          post_id: string;
          user_id: string;
        };
        Update: never;
      };
      bookmarks: {
        Row: {
          post_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          post_id: string;
          user_id: string;
        };
        Update: never;
      };
      conversations: {
        Row: {
          id: string;
          student_id: string;
          created_at: string;
          last_message_at: string;
        };
        Insert: {
          student_id: string;
        };
        Update: never;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          kind: MessageKind;
          body: string | null;
          media_url: string | null;
          voice_duration_seconds: number | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          sender_id: string;
          kind?: MessageKind;
          body?: string | null;
          media_url?: string | null;
          voice_duration_seconds?: number | null;
        };
        Update: {
          read_at?: string | null;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          kind: NotificationKind;
          title: string;
          body: string | null;
          related_post_id: string | null;
          related_conversation_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: {
          read_at?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: { uid?: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      post_channel: PostChannel;
      attachment_kind: AttachmentKind;
      message_kind: MessageKind;
      notification_kind: NotificationKind;
    };
  };
}
