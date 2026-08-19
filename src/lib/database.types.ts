/**
 * Hand-written mirror of the schema in supabase/migrations/20260818120000_backend_foundation.sql.
 * Shaped to match what `supabase gen types typescript` produces, so it's a drop-in
 * replacement once the project is linked and types can be generated for real.
 */

export type UserRole = 'admin' | 'student';
export type PostChannel = 'official' | 'students';
export type AttachmentKind = 'none' | 'image' | 'video' | 'pdf' | 'poll' | 'chart';
export type MessageKind = 'text' | 'image' | 'pdf' | 'chart' | 'voice' | 'video';
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Update: Record<string, never>;
        Relationships: [];
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
        Update: Record<string, never>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          student_id: string;
          created_at: string;
          last_message_at: string;
          media_bytes_used: number;
        };
        Insert: {
          student_id: string;
        };
        Update: Record<string, never>;
        Relationships: [];
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
          client_id: string | null;
          deleted_at: string | null;
          storage_key: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          file_name: string | null;
          media_purged: boolean;
        };
        Insert: {
          conversation_id: string;
          sender_id: string;
          kind?: MessageKind;
          body?: string | null;
          media_url?: string | null;
          voice_duration_seconds?: number | null;
          client_id?: string | null;
          storage_key?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          file_name?: string | null;
        };
        Update: {
          read_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
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
        Insert: Record<string, never>;
        Update: {
          read_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: { uid?: string };
        Returns: boolean;
      };
      get_or_create_my_conversation: {
        Args: Record<string, never>;
        Returns: string;
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: number;
      };
      my_chat_overview: {
        Args: Record<string, never>;
        Returns: {
          conversation_id: string;
          unread_count: number;
          last_message_at: string;
          last_message_preview: string | null;
        }[];
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
