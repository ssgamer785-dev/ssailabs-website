/**
 * Upload grants: a record of every object key this API signs an upload for.
 *
 * The database accepts a chat message or post that names a storage object only
 * through an unused grant owned by the person inserting it
 * (20260928090000_server_issued_media_and_row_guards.sql), and copies the size
 * and type from the grant rather than from the client. So the key, its owner,
 * its conversation, its size and its type are all decided here.
 *
 * Deployment order: this code ships before that migration. Until the table
 * exists, recording is skipped (with one warning) so uploads keep working.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UploadGrant {
  storageKey: string;
  ownerId: string;
  scope: 'chat' | 'post';
  conversationId?: string | null;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  posterKey?: string | null;
  posterSizeBytes?: number | null;
}

const TABLE = 'media_upload_grants';
let missingTableWarned = false;

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01'
    || (/media_upload_grants/.test(error.message ?? '') && /does not exist|schema cache/i.test(error.message ?? ''));
}

/**
 * Records the grant. Resolves true once it is stored, false when the table
 * does not exist yet (API deployed ahead of the migration); throws otherwise.
 */
export async function recordUploadGrant(db: SupabaseClient, grant: UploadGrant): Promise<boolean> {
  const { error } = await db.from(TABLE).insert({
    storage_key: grant.storageKey,
    owner_id: grant.ownerId,
    scope: grant.scope,
    conversation_id: grant.scope === 'chat' ? grant.conversationId ?? null : null,
    kind: grant.kind,
    mime_type: grant.mimeType,
    size_bytes: grant.sizeBytes,
    poster_key: grant.posterKey ?? null,
    poster_size_bytes: grant.posterKey ? grant.posterSizeBytes ?? null : null,
  });
  if (!error) {
    if (Math.random() < 0.01) void pruneUsedGrants(db);
    return true;
  }
  if (isMissingTable(error)) {
    if (!missingTableWarned) {
      missingTableWarned = true;
      console.warn('[media] upload grants are not recorded yet: the media_upload_grants table does not exist');
    }
    return false;
  }
  throw error;
}

/**
 * Used chat grants have done their job once the message exists (a chat key's
 * conversation proves where it belongs). Post grants are kept: an author-free
 * post key is proven to be its author's only by its grant. Unused grants are
 * kept too: they are the list of uploads that never became a message or post.
 */
async function pruneUsedGrants(db: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { error } = await db.from(TABLE).delete().eq('scope', 'chat').not('used_at', 'is', null).lt('created_at', cutoff);
  if (error && !isMissingTable(error)) console.error('[media] pruning used upload grants failed', error.message);
}

export function resetUploadGrantWarningForTests(): void {
  missingTableWarned = false;
}
