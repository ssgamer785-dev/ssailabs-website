/**
 * Production reset — step 2 of 4: R2 media cleanup for non-admin members.
 *
 * Deletes only the R2 objects this script can confidently attribute to a
 * non-admin member, through the actual ownership columns already in the
 * schema:
 *   - public.posts.storage_key / poster_key     owned by posts.author_id
 *   - public.messages.storage_key / poster_key  owned by messages.sender_id
 *   - public.profiles.avatar_key                owned by profiles.id itself
 *
 * Ownership is never inferred from a bucket prefix, a conversation id, or a
 * post id — only from the column that actually names who uploaded the
 * object. That is what keeps an admin's own uploads safe even when they sit
 * inside a student's chat thread (R2 chat keys are prefixed by conversation
 * id, not sender, so prefix-based deletion would catch admin-sent objects
 * too; this script never does that).
 *
 * Must run BEFORE the database reset (03_reset_database.sql / equivalent):
 * this script reads storage_key / poster_key / avatar_key straight out of
 * Postgres, and deleting the owning rows is exactly what makes those columns
 * disappear.
 *
 * Safe by default: with no flags this only lists/counts what it would
 * delete and writes a manifest JSON file. Nothing is deleted from R2 unless
 * you pass --execute AND the confirmation phrase matches exactly.
 *
 * Configuration comes entirely from this project's existing environment
 * variables (see .env.example) — nothing here invents a credential, bucket
 * name, endpoint, or key prefix:
 *   SUPABASE_URL or VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * The R2 endpoint is built the same way server/r2.ts already builds it
 * (`https://${accountId}.r2.cloudflarestorage.com`), and object deletion
 * uses the same @aws-sdk/client-s3 dependency the app's own media routers
 * use — no new package is introduced.
 *
 * Usage:
 *   npx tsx 02_reset_r2_media.ts                     # dry run (default)
 *   npx tsx 02_reset_r2_media.ts --execute \
 *     --confirm "CONFIRM PRODUCTION RESET — KEEP ADMIN ONLY"
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { writeFileSync } from 'node:fs';

const CONFIRM_PHRASE = 'CONFIRM PRODUCTION RESET — KEEP ADMIN ONLY';

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function requireEnv(name: string, alt?: string): string {
  const v = env(name) ?? (alt ? env(alt) : undefined);
  if (!v) {
    console.error(`Missing required environment variable: ${name}${alt ? ` (or ${alt})` : ''}`);
    process.exit(1);
  }
  return v;
}

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const confirmIdx = args.indexOf('--confirm');
const confirmArg = confirmIdx >= 0 ? args[confirmIdx + 1] : undefined;

interface KeyEntry {
  key: string;
  source: string;
  ownerId: string;
  sizeBytes: number | null;
}

interface SkippedEntry {
  table: string;
  rowId: string;
  reason: string;
}

async function main() {
  console.log(EXECUTE ? '=== R2 CLEANUP: LIVE RUN ===' : '=== R2 CLEANUP: DRY RUN (default; pass --execute to actually delete) ===');

  if (EXECUTE && confirmArg !== CONFIRM_PHRASE) {
    console.error('\nABORTED: --execute requires --confirm "CONFIRM PRODUCTION RESET — KEEP ADMIN ONLY" (exact match). Nothing was touched.');
    process.exit(1);
  }

  // Read from this project's own environment — matches server/r2.ts exactly,
  // no invented names, defaults, or fallbacks.
  const supabaseUrl = requireEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucket = requireEnv('R2_BUCKET');

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  // ---- 1. Admin-count guard ---------------------------------------------
  const { data: admins, error: adminErr } = await db.from('profiles').select('id').eq('role', 'admin');
  if (adminErr) { console.error('Could not read profiles:', adminErr.message); process.exit(1); }
  if (!admins || admins.length !== 1) {
    console.error(`\nABORTED: expected exactly 1 admin profile, found ${admins?.length ?? 0}. Nothing was touched.`);
    process.exit(1);
  }
  const adminIds = new Set(admins.map(a => a.id));
  console.log(`Admin verified: exactly 1 admin profile (id ${admins[0].id}).`);

  // ---- 2. Non-admin ids, identified only via profiles.role <> 'admin' ---
  const { data: nonAdmins, error: naErr } = await db.from('profiles').select('id, full_name').neq('role', 'admin');
  if (naErr) { console.error('Could not read profiles:', naErr.message); process.exit(1); }
  const nonAdminIds = new Set((nonAdmins ?? []).map(p => p.id));
  console.log(`Non-admin users found: ${nonAdminIds.size}.`);

  if (nonAdminIds.size === 0) {
    console.log('Nothing to do — no non-admin users exist. Exiting.');
    return;
  }

  // ---- 3. Collect keys, scoped strictly to confirmed non-admin ownership
  const entries: KeyEntry[] = [];
  const skipped: SkippedEntry[] = [];

  const { data: posts, error: postsErr } = await db
    .from('posts')
    .select('id, author_id, storage_key, poster_key, size_bytes, poster_size_bytes');
  if (postsErr) { console.error('Could not read posts:', postsErr.message); process.exit(1); }
  for (const p of posts ?? []) {
    if (!p.storage_key && !p.poster_key) continue;
    if (!p.author_id || (!nonAdminIds.has(p.author_id) && !adminIds.has(p.author_id))) {
      // author_id doesn't resolve to any known profile (admin or non-admin) —
      // ownership cannot be confidently established. Never delete this one.
      if (p.storage_key) skipped.push({ table: 'posts.storage_key', rowId: p.id, reason: 'author_id does not resolve to a known profile' });
      if (p.poster_key) skipped.push({ table: 'posts.poster_key', rowId: p.id, reason: 'author_id does not resolve to a known profile' });
      continue;
    }
    if (!nonAdminIds.has(p.author_id)) continue; // admin-owned — never touched
    if (p.storage_key) entries.push({ key: p.storage_key, source: `posts.storage_key (post ${p.id})`, ownerId: p.author_id, sizeBytes: p.size_bytes ?? null });
    if (p.poster_key) entries.push({ key: p.poster_key, source: `posts.poster_key (post ${p.id})`, ownerId: p.author_id, sizeBytes: p.poster_size_bytes ?? null });
  }

  const { data: messages, error: msgErr } = await db
    .from('messages')
    .select('id, sender_id, storage_key, poster_key, size_bytes, poster_size_bytes');
  if (msgErr) { console.error('Could not read messages:', msgErr.message); process.exit(1); }
  for (const m of messages ?? []) {
    if (!m.storage_key && !m.poster_key) continue;
    if (!m.sender_id || (!nonAdminIds.has(m.sender_id) && !adminIds.has(m.sender_id))) {
      if (m.storage_key) skipped.push({ table: 'messages.storage_key', rowId: m.id, reason: 'sender_id does not resolve to a known profile' });
      if (m.poster_key) skipped.push({ table: 'messages.poster_key', rowId: m.id, reason: 'sender_id does not resolve to a known profile' });
      continue;
    }
    if (!nonAdminIds.has(m.sender_id)) continue; // admin-sent — never touched, even inside a student's thread
    if (m.storage_key) entries.push({ key: m.storage_key, source: `messages.storage_key (message ${m.id})`, ownerId: m.sender_id, sizeBytes: m.size_bytes ?? null });
    if (m.poster_key) entries.push({ key: m.poster_key, source: `messages.poster_key (message ${m.id})`, ownerId: m.sender_id, sizeBytes: m.poster_size_bytes ?? null });
  }

  const { data: avatarProfiles, error: avErr } = await db
    .from('profiles')
    .select('id, avatar_key')
    .not('avatar_key', 'is', null);
  if (avErr) { console.error('Could not read profile avatars:', avErr.message); process.exit(1); }
  for (const p of avatarProfiles ?? []) {
    if (!p.avatar_key) continue;
    if (!nonAdminIds.has(p.id)) continue; // admin's own avatar, or an id we don't otherwise recognise — never touched
    entries.push({ key: p.avatar_key, source: `profiles.avatar_key (profile ${p.id})`, ownerId: p.id, sizeBytes: null });
  }

  // ---- 4. Report --------------------------------------------------------
  const totalBytes = entries.reduce((sum, e) => sum + (e.sizeBytes ?? 0), 0);
  const byOwner = new Map<string, number>();
  for (const e of entries) byOwner.set(e.ownerId, (byOwner.get(e.ownerId) ?? 0) + 1);

  console.log(`\nNon-admin users found: ${nonAdminIds.size}`);
  console.log(`R2 keys found (attributable to a non-admin owner): ${entries.length}`);
  console.log(`  across ${byOwner.size} distinct non-admin owner(s)`);
  console.log(`Total objects: ${entries.length}`);
  console.log(`Total bytes (known sizes only — some entries may have unknown size): ${totalBytes} bytes (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Objects skipped — ownership could not be confidently established: ${skipped.length}`);
  if (skipped.length) {
    for (const s of skipped) console.log(`  SKIPPED  ${s.table} on ${s.rowId}: ${s.reason}`);
  }

  // ---- 5. Write an audit manifest before doing anything irreversible ----
  const manifestPath = `./r2-reset-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(manifestPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    execute: EXECUTE,
    nonAdminUsers: nonAdminIds.size,
    totalObjects: entries.length,
    totalBytes,
    entries,
    skipped,
  }, null, 2));
  console.log(`\nManifest written to ${manifestPath}`);

  if (!EXECUTE) {
    console.log('\nDry run only — nothing was deleted from R2. Re-run with --execute and the confirmation phrase to actually delete these objects.');
    return;
  }

  // ---- 6. Delete, chunked to R2/S3's 1000-key-per-request limit ---------
  const CHUNK = 1000;
  let deleted = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK).map(e => ({ Key: e.key }));
    if (!chunk.length) continue;
    const result = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk, Quiet: true } }));
    const errors = result.Errors ?? [];
    if (errors.length) {
      console.error(`R2 delete reported ${errors.length} failure(s) in this batch:`);
      for (const e of errors) console.error(`  ${e.Key}: ${e.Code} — ${e.Message}`);
    }
    deleted += chunk.length - errors.length;
  }

  console.log(`\nDone. ${deleted} of ${entries.length} R2 objects deleted.`);
  if (deleted !== entries.length) {
    console.error('Some deletions failed — see errors above. Re-run this script (it is idempotent: an already-deleted key is simply not found and is skipped by R2).');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error — nothing further will run:', err);
  process.exit(1);
});
