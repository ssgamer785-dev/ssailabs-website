import type { MessageKind } from '../database.types';

export type { MessageKind };

/** Lifecycle of an outgoing message, from optimistic bubble to confirmed row. */
export type SendStatus = 'sending' | 'uploading' | 'sent' | 'failed';

/** Attachment kinds that carry an R2 object (i.e. everything except plain text). */
export type MediaKind = 'image' | 'video' | 'pdf' | 'voice';

export interface ChatMessage {
  /** Server row id once persisted; before that, the client id. */
  id: string;
  /** Stable across the optimistic insert and the row that comes back. */
  clientId: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  body: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  fileName: string | null;
  voiceDurationSeconds: number | null;
  readAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  mediaPurged: boolean;

  status: SendStatus;
  /** 0..1 while the attachment uploads. */
  progress?: number;
  error?: string;
  /** Object URL so an image/voice bubble renders before the upload finishes. */
  localPreviewUrl?: string;
  /** Held for retry after a failed upload. */
  pendingFile?: Blob;
}

export type ConnectionState = 'connecting' | 'online' | 'offline';

export const MEDIA_QUOTA_BYTES = 100 * 1024 * 1024;

export function isMediaKind(kind: MessageKind): kind is MediaKind {
  return kind === 'image' || kind === 'video' || kind === 'pdf' || kind === 'voice';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "10:31 AM" — matches the timestamps in the original design. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
