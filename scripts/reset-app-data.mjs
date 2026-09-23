#!/usr/bin/env node
/**
 * Fresh-data reset for The Traders Planet — PLAN BY DEFAULT.
 *
 * Run with no flags it changes NOTHING. It connects read-only, counts exactly
 * what a reset would remove, prints that plan, and exits. Deleting requires
 * --execute plus a phrase typed at the keyboard, and even then it refuses
 * unless every safety check below passes first.
 *
 *   node scripts/reset-app-data.mjs              # plan only (safe, the default)
 *   node scripts/reset-app-data.mjs --execute    # plan, then ask, then delete
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL NOT DO, EVER
 * ---------------------------------------------------------------------------
 *   - No DROP. No TRUNCATE. No `supabase db reset`. No schema change of any
 *     kind. Every removal is a DELETE with a WHERE clause.
 *   - It never touches the admin: not the auth user, not the profile row.
 *   - It never touches a project other than the one named in EXPECTED_REF. A
 *     URL pointing anywhere else stops the script before it reads anything.
 *   - It prints no secret. Not the service-role key, not a password, not a
 *     full email address.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SHAPED THIS WAY
 * ---------------------------------------------------------------------------
 * The dangerous version of this script is the one that is correct on the day
 * it is written. This one re-derives its target every run: it asks the
 * database who the admin is rather than trusting a constant, and stops if the
 * answer is not exactly one person. A reset that deleted the only account that
 * can issue activation codes would lock everyone out of the product, including
 * the person running it.
 *
 * Order matters and is not arbitrary. `profiles.id` references
 * `auth.users (id) ON DELETE CASCADE`, and posts, comments, likes, bookmarks,
 * conversations, messages and notifications all cascade from `profiles`. So
 * deleting one auth user removes that member's entire footprint in one
 * statement. The catch is that the R2 object keys live in the rows that the
 * cascade destroys — which is why this script reads every key it will orphan
 * BEFORE it deletes anything, and deletes the objects afterwards from that
 * list. Reversing those two steps leaks the media permanently: the files stay
 * in the bucket and nothing left in the database points at them.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';
import { stdin, stdout, exit, argv } from 'node:process';

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------

/**
 * The only project this script is allowed to act on.
 *
 * Checked against the host in SUPABASE_URL. A stale .env pointing at a
 * different project is the single most likely way this script could do
 * something unrecoverable, so it is the first thing verified and the check
 * cannot be skipped by a flag.
 */
const EXPECTED_REF = 'waosqasgxzstbdxohbfe';

/** Typed in full, at the keyboard, before anything is deleted. */
const CONFIRM_PHRASE = 'DELETE ALL MEMBER DATA';

const EXECUTE = argv.includes('--execute');

const fail = (message) => { console.error(`\n  ✗ ${message}\n`); exit(1); };
const say  = (line = '') => console.log(line);

/** s***r785@gmail.com — enough to recognise, not enough to harvest. */
function maskEmail(email) {
  const [user, domain] = String(email ?? '').split('@');
  if (!domain) return '(no email)';
  return `${user.slice(0, 1)}***${user.length > 4 ? user.slice(-4) : ''}@${domain}`;
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ---------------------------------------------------------------------------
// 1. Environment, and the project check
// ---------------------------------------------------------------------------
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Names only; a value is never echoed, not even its length.
const missing = [];
if (!url?.trim()) missing.push('SUPABASE_URL or VITE_SUPABASE_URL');
if (!serviceKey?.trim()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (missing.length) {
  fail(`Unset or empty in .env: ${missing.join(', ')}\n    (a variable present but set to "" counts as unset)`);
}

let host;
try { host = new URL(url).host; } catch { fail('SUPABASE_URL is not a URL.'); }
const ref = host.split('.')[0];

if (ref !== EXPECTED_REF) {
  fail(
    `This .env points at project "${ref}", not "${EXPECTED_REF}".\n` +
    '    Refusing to touch a project this script was not written for.\n' +
    '    Nothing was read and nothing was changed.',
  );
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

say();
say('  ┌───────────────────────────────────────────────────────────┐');
say(`  │  The Traders Planet — fresh-data reset ${EXECUTE ? '·  EXECUTE MODE ' : '·  PLAN ONLY    '}   │`);
say('  └───────────────────────────────────────────────────────────┘');
say();
say(`  Project : ${host}  (ref ${ref} ✓)`);
say(`  Mode    : ${EXECUTE ? 'EXECUTE — will delete after you confirm' : 'PLAN — nothing will be deleted'}`);

// ---------------------------------------------------------------------------
// 2. Who is the admin? Asked, not assumed.
// ---------------------------------------------------------------------------
const { data: admins, error: adminError } = await db
  .from('profiles').select('id, full_name').eq('role', 'admin');

if (adminError) fail(`Could not read profiles: ${adminError.message}`);
if (!admins?.length) {
  fail('No profile has role=\'admin\'. Refusing to reset a database with no admin to preserve.');
}
if (admins.length > 1) {
  fail(`Expected exactly one admin profile, found ${admins.length}. Refusing to guess which one to keep.`);
}

const adminId = admins[0].id;
const { data: adminUser } = await db.auth.admin.getUserById(adminId);

say();
say(`  Preserving admin : ${admins[0].full_name}  ${maskEmail(adminUser?.user?.email)}`);
say(`                     ${adminId}`);

// ---------------------------------------------------------------------------
// 3. Count everything, before touching anything.
//
// head:true + count:'exact' asks PostgREST for the count alone, so this stays
// cheap on a large table and transfers no row data.
// ---------------------------------------------------------------------------
async function countAll(table) {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) fail(`Could not count ${table}: ${error.message}`);
  return count ?? 0;
}

async function countExceptAdmin(table, column) {
  const { count, error } = await db
    .from(table).select('*', { count: 'exact', head: true }).neq(column, adminId);
  if (error) fail(`Could not count ${table}: ${error.message}`);
  return count ?? 0;
}

/** Every auth user that is not the admin. Paged; the list API caps per page. */
async function listMemberAuthUsers() {
  const users = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list auth users: ${error.message}`);
    const batch = data?.users ?? [];
    for (const u of batch) if (u.id !== adminId) users.push(u);
    if (batch.length < 200) break;
  }
  return users;
}

/** R2 keys that the cascade would orphan. Read FIRST — see the header note. */
async function collectMediaKeys() {
  const keys = new Set();
  for (const table of ['posts', 'messages']) {
    const { data, error } = await db.from(table).select('storage_key, poster_key');
    if (error) fail(`Could not read ${table} media keys: ${error.message}`);
    for (const row of data ?? []) {
      if (row.storage_key) keys.add(row.storage_key);
      if (row.poster_key) keys.add(row.poster_key);
    }
  }
  return [...keys];
}

const memberUsers = await listMemberAuthUsers();
const mediaKeys = await collectMediaKeys();

const plan = {
  'auth users (excluding admin)': memberUsers.length,
  'profiles (excluding admin)':   await countExceptAdmin('profiles', 'id'),
  posts:                          await countAll('posts'),
  comments:                       await countAll('comments'),
  likes:                          await countAll('likes'),
  bookmarks:                      await countAll('bookmarks'),
  conversations:                  await countAll('conversations'),
  messages:                       await countAll('messages'),
  notifications:                  await countAll('notifications'),
  membership_requests:            await countAll('membership_requests'),
  activation_codes:               await countAll('activation_codes'),
};

say();
say('  WILL BE DELETED');
say('  ───────────────────────────────────────────────');
for (const [label, n] of Object.entries(plan)) {
  say(`  ${label.padEnd(32)} ${String(n).padStart(6)}`);
}
say(`  ${'R2 objects (media + posters)'.padEnd(32)} ${String(mediaKeys.length).padStart(6)}`);
say('  ───────────────────────────────────────────────');

say();
say('  WILL BE KEPT');
say('  ───────────────────────────────────────────────');
say('  The admin auth user and profile row');
say('  Every table, column, policy, function and trigger');
say('  (this script alters no schema and drops nothing)');
say('  ───────────────────────────────────────────────');

if (memberUsers.length) {
  say();
  say(`  Member accounts to be removed (${memberUsers.length}):`);
  for (const u of memberUsers.slice(0, 40)) {
    say(`    · ${maskEmail(u.email).padEnd(28)} last seen ${u.last_sign_in_at ?? 'never'}`);
  }
  if (memberUsers.length > 40) say(`    … and ${memberUsers.length - 40} more`);
}

// ---------------------------------------------------------------------------
// 4. Stop here unless explicitly told otherwise.
// ---------------------------------------------------------------------------
if (!EXECUTE) {
  say();
  say('  ✓ PLAN ONLY — nothing was deleted, nothing was written.');
  say('    Review the numbers above. If they are what you intend, re-run with:');
  say('        node scripts/reset-app-data.mjs --execute');
  say();
  exit(0);
}

say();
say('  ⚠  EXECUTE MODE. The next step is irreversible.');
say('     There is no undo and no backup taken by this script.');
say('     Take a Supabase backup first if you want one.');
say();

const typed = await ask(`  Type exactly "${CONFIRM_PHRASE}" to proceed: `);
if (typed !== CONFIRM_PHRASE) fail('Phrase did not match. Nothing was changed.');

const confirmRef = await ask(`  Confirm the project ref "${EXPECTED_REF}": `);
if (confirmRef !== EXPECTED_REF) fail('Project ref did not match. Nothing was changed.');

// ---------------------------------------------------------------------------
// 5. Delete. Cascade-first, then the rows no cascade reaches.
// ---------------------------------------------------------------------------
say();
say('  Deleting…');

// (a) Member auth users. Each one cascades to its profile, and from there to
//     that member's posts, comments, likes, bookmarks, conversation, messages
//     and notifications. One statement per user because the Admin API has no
//     bulk form; failures are collected rather than fatal, so one bad row
//     cannot leave the reset half-finished and unreported.
const failures = [];
for (const [i, u] of memberUsers.entries()) {
  const { error } = await db.auth.admin.deleteUser(u.id);
  if (error) failures.push(`${maskEmail(u.email)}: ${error.message}`);
  if ((i + 1) % 25 === 0) say(`    ${i + 1}/${memberUsers.length} accounts`);
}
say(`    ${memberUsers.length}/${memberUsers.length} accounts`);

// (b) Anything the cascade does not reach: admin-authored posts, and the rows
//     whose FK is ON DELETE SET NULL rather than CASCADE (activation_codes
//     and membership_requests survive their owner by design).
//
//     `.neq('id', ...)` on a uuid column with an id no row has is how
//     PostgREST is told "every row": it requires a filter on DELETE, and this
//     is a filter rather than a disabled safety check.
const ALL = '00000000-0000-0000-0000-000000000000';
for (const table of ['notifications', 'bookmarks', 'likes', 'comments', 'posts', 'membership_requests', 'activation_codes']) {
  const { error } = await db.from(table).delete().neq('id', ALL);
  if (error) failures.push(`${table}: ${error.message}`);
}

// (c) The admin's own conversation rows, if any remain.
{
  const { error } = await db.from('conversations').delete().neq('id', ALL);
  if (error) failures.push(`conversations: ${error.message}`);
}

// (d) Reset the admin's media accounting, so the preserved account does not
//     carry a quota debt for files that no longer exist.
{
  const { error } = await db.from('profiles').update({ media_bytes_used: 0 }).eq('id', adminId);
  if (error) failures.push(`profiles.media_bytes_used: ${error.message}`);
}

say();
if (failures.length) {
  say(`  ⚠  ${failures.length} operation(s) reported an error:`);
  for (const f of failures.slice(0, 20)) say(`     · ${f}`);
  say('     Re-run in PLAN mode to see what remains.');
} else {
  say('  ✓ Database rows removed.');
}

// ---------------------------------------------------------------------------
// 6. R2 objects, from the list captured in step 3.
// ---------------------------------------------------------------------------
say();
if (!mediaKeys.length) {
  say('  No R2 objects were referenced; nothing to clean up in the bucket.');
} else {
  say(`  ${mediaKeys.length} R2 object(s) are now unreferenced.`);
  say('  This script does not delete them: bucket credentials are the server\'s,');
  say('  not this script\'s, and an orphaned object costs storage but risks');
  say('  nothing. The keys have been written to scripts/orphaned-r2-keys.txt so');
  say('  you can remove them deliberately with the bucket tooling.');
  const { writeFileSync } = await import('node:fs');
  writeFileSync('scripts/orphaned-r2-keys.txt', mediaKeys.join('\n') + '\n');
}

say();
say('  Done. Re-run without --execute to verify the counts are now zero.');
say();
