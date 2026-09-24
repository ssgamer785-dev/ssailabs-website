/**
 * Hand-written mirror of the schema in supabase/migrations/20260818120000_backend_foundation.sql.
 * Shaped to match what `supabase gen types typescript` produces, so it's a drop-in
 * replacement once the project is linked and types can be generated for real.
 */

export type MembershipRequestStatus = 'pending' | 'contacted' | 'approved' | 'rejected';
export type UserRole = 'admin' | 'student';
export type PostChannel = 'official' | 'students';
export type AttachmentKind = 'none' | 'image' | 'video' | 'pdf' | 'file' | 'poll' | 'chart' | 'voice';
export type MessageKind = 'text' | 'image' | 'pdf' | 'file' | 'chart' | 'voice' | 'video';
export type NotificationKind = 'signal' | 'chat' | 'like' | 'comment' | 'target' | 'session';
/** Where a media row is in its upload: 'pending' until the bytes reach R2. */
export type UploadStatus = 'pending' | 'ready';

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
          /** R2 key under avatars/<uid>/. Private — read through a signed GET. */
          avatar_key: string | null;
          created_at: string;
          updated_at: string;
          /** Set only by redeem_activation_code(). NULL = held at the activation gate. */
          activated_at: string | null;
          activation_code_id: string | null;
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
          avatar_key?: string | null;
        };
        Relationships: [];
      };
      poll_options: {
        Row: {
          id: string;
          post_id: string;
          /** 0-based render order. Not called `position`: that is reserved in SQL. */
          sort_order: number;
          label: string;
          created_at: string;
        };
        Insert: { post_id: string; sort_order: number; label: string };
        Update: { label?: string; sort_order?: number };
        Relationships: [];
      };
      poll_votes: {
        Row: {
          post_id: string;
          option_id: string;
          voter_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: { post_id: string; option_id: string; voter_id: string };
        Update: { option_id?: string };
        Relationships: [];
      };
      membership_requests: {
        Row: {
          id: string;
          requested_by: string | null;
          email: string;
          name: string;
          mobile: string;
          trading_experience: string;
          address: string;
          status: MembershipRequestStatus;
          created_at: string;
        };
        Insert: {
          requested_by: string;
          email: string;
          name: string;
          mobile: string;
          trading_experience: string;
          address: string;
        };
        Update: { status?: MembershipRequestStatus };
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
          storage_key: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          file_name: string | null;
          media_purged: boolean;
          poster_key: string | null;
          poster_size_bytes: number | null;
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
          storage_key?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          file_name?: string | null;
          poster_key?: string | null;
          poster_size_bytes?: number | null;
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
          storage_key?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          file_name?: string | null;
          poster_key?: string | null;
          poster_size_bytes?: number | null;
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
          client_id: string | null;
        };
        Insert: {
          post_id: string;
          author_id: string;
          body?: string | null;
          voice_url?: string | null;
          voice_duration_seconds?: number | null;
          is_anonymous?: boolean;
          client_id?: string | null;
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
          poster_key: string | null;
          poster_size_bytes: number | null;
          upload_status: UploadStatus;
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
          poster_key?: string | null;
          poster_size_bytes?: number | null;
          upload_status?: UploadStatus;
        };
        Update: {
          read_at?: string | null;
          deleted_at?: string | null;
          poster_key?: string | null;
          poster_size_bytes?: number | null;
          upload_status?: UploadStatus;
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
      is_activated: {
        Args: { uid?: string };
        Returns: boolean;
      };
      normalise_activation_code: {
        Args: { p_code: string };
        Returns: string;
      };
      /** Returns { ok, reason }. Never takes a user id — it acts on auth.uid(). */
      redeem_activation_code: {
        Args: { p_code: string };
        Returns: { ok: boolean; reason: string };
      };
      /** Admin only. Returns the plaintext code once; nothing stores it. */
      create_activation_code: {
        Args: Record<string, never>;
        Returns: { id: string; code: string; expires_at: string };
      };
      admin_activation_codes: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          code_hint: string;
          created_at: string;
          expires_at: string;
          redeemed_at: string | null;
          redeemed_by_name: string | null;
          status: string;
        }[];
      };
      admin_membership_requests: {
        Args: { p_limit?: number };
        Returns: Database['public']['Tables']['membership_requests']['Row'][];
      };
      admin_set_membership_status: {
        Args: { p_id: string; p_status: MembershipRequestStatus };
        Returns: void;
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
      posts_feed: {
        Args: { p_channel: PostChannel; p_before?: string | null; p_limit?: number };
        Returns: {
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
          storage_key: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          file_name: string | null;
          media_purged: boolean;
          chart_seed: number | null;
          is_anonymous: boolean;
          display_name: string;
          created_at: string;
          updated_at: string;
          author_name: string;
          author_role: UserRole | null;
          is_mine: boolean;
          like_count: number;
          comment_count: number;
          liked_by_me: boolean;
        }[];
      };
      post_comments: {
        Args: { p_post_id: string; p_before?: string | null; p_limit?: number };
        Returns: {
          id: string;
          post_id: string;
          author_id: string;
          body: string | null;
          voice_url: string | null;
          voice_duration_seconds: number | null;
          is_anonymous: boolean;
          display_name: string;
          created_at: string;
          author_name: string;
          is_mine: boolean;
        }[];
      };
      my_unread_notification_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      /** One post in the feed row shape, plus bookmark state. RLS still applies. */
      post_by_id: {
        Args: { p_post_id: string };
        Returns: Record<string, unknown>[];
      };
      /** Aggregate counts without exposing who voted for what. */
      poll_results: {
        Args: { p_post_id: string };
        Returns: {
          option_id: string;
          sort_order: number;
          label: string;
          vote_count: number;
          is_my_vote: boolean;
        }[];
      };
      /** Records or changes the caller's vote. Returns { ok, reason? }. */
      cast_poll_vote: {
        Args: { p_post_id: string; p_option_id: string };
        Returns: { ok: boolean; reason?: string };
      };
      /** Post + options in one transaction. Returns the new post id. */
      create_poll_post: {
        Args: {
          p_channel: PostChannel;
          p_question: string;
          p_options: string[];
          p_is_anonymous?: boolean;
        };
        Returns: string;
      };
      /** Admin only — empty for anyone else, by construction. */
      admin_conversations: {
        Args: Record<string, never>;
        Returns: {
          student_id: string;
          full_name: string;
          avatar_key: string | null;
          reveal_identity: boolean;
          activated_at: string | null;
          conversation_id: string | null;
          unread_count: number;
          last_message_at: string | null;
          last_message_preview: string | null;
        }[];
      };
      /** Admin only. Idempotent: returns the existing thread when there is one. */
      admin_open_conversation: {
        Args: { p_student_id: string };
        Returns: string;
      };
      mark_all_notifications_read: {
        Args: Record<string, never>;
        Returns: number;
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
