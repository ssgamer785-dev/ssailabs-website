-- ============================================================================
-- RC5 — "Post with my real name" defaults to ON (decision: Option A).
--
-- Additive and idempotent. Nothing is deleted, no existing post or comment is
-- touched: every post and comment keeps the anonymity it was written with
-- (posts.is_anonymous / comments.is_anonymous are per row), so no past content
-- is ever re-attributed.
--
--   1. New accounts start ON (column default; handle_new_user() does not set
--      the column, so it picks the default up unchanged).
--   2. From now on, when a member flips the switch themselves, the time is
--      recorded (profiles.reveal_identity_chosen_at). Until today the database
--      could not tell "never chose" from "chose OFF" — the default was OFF.
--   3. Existing students are switched ON only where the data PROVES they never
--      made a choice: OFF today, no post or comment of theirs exists (named or
--      anonymous, either community), never started a community upload, and the
--      profile row not written since sign-up/activation (every write moves
--      updated_at via profiles_set_updated_at, and the switch only exists
--      after activation). Everyone else keeps exactly what they have.
--      Each switched account is recorded in private.rc5_reveal_identity_backfill
--      so the change can be reversed exactly, member by member.
--
-- Who sees the real name is unchanged and enforced in the database: admins
-- always (posts_feed / post_by_id / post_comments resolve profiles.full_name
-- for is_admin()); other students see the per-row snapshot, "Unknown User" on
-- an anonymous row, and RLS keeps anonymous rows' author_id from them.
-- ============================================================================

-- 1. New accounts: ON.
alter table public.profiles alter column reveal_identity set default true;

comment on column public.profiles.reveal_identity is
  'Default "post with my real name" preference for NEW posts and comments (ON for new accounts since RC5). Individual posts and comments snapshot their own is_anonymous. Admins always see the real name regardless.';

-- 2. Explicit choices, recorded from now on.
alter table public.profiles add column if not exists reveal_identity_chosen_at timestamptz;

comment on column public.profiles.reveal_identity_chosen_at is
  'When the member last set "post with my real name" themselves. NULL = never chosen (the value is a default). Maintained by trigger; not writable by clients.';

create or replace function public.track_reveal_identity_choice()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- Only a member's own change counts as a choice; the server, a migration or
  -- the SQL editor never stamps one. A client cannot write the column itself.
  if current_user in ('authenticated', 'anon') then
    new.reveal_identity_chosen_at := case
      when new.reveal_identity is distinct from old.reveal_identity then now()
      else old.reveal_identity_chosen_at
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.track_reveal_identity_choice() from public, anon, authenticated;

drop trigger if exists profiles_track_reveal_choice on public.profiles;
create trigger profiles_track_reveal_choice
  before update on public.profiles
  for each row execute function public.track_reveal_identity_choice();

-- 3. Option A, for existing students.
create schema if not exists private;

create table if not exists private.rc5_reveal_identity_backfill (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  previous_value boolean not null,
  switched_at    timestamptz not null default now()
);

comment on table private.rc5_reveal_identity_backfill is
  'RC5 Option A: the students whose "post with my real name" was switched ON because the data proved they never chose. Kept so the change can be reversed exactly.';

revoke all on private.rc5_reveal_identity_backfill from public, anon, authenticated;

-- Runs once in effect: a switched student is ON afterwards, and anyone who has
-- chosen since has reveal_identity_chosen_at set, so a re-run finds no one new
-- among existing rows.
with eligible as (
  select pr.id
    from public.profiles pr
   where pr.role = 'student'
     and pr.reveal_identity = false
     and pr.reveal_identity_chosen_at is null
     and not exists (select 1 from public.posts p where p.author_id = pr.id)
     and not exists (select 1 from public.comments c where c.author_id = pr.id)
     and not exists (select 1 from public.media_upload_grants g where g.owner_id = pr.id and g.scope = 'post')
     and pr.updated_at <= greatest(pr.created_at, coalesce(pr.activated_at, pr.created_at)) + interval '5 seconds'
)
insert into private.rc5_reveal_identity_backfill (user_id, previous_value)
select id, false from eligible
on conflict (user_id) do nothing;

update public.profiles pr
   set reveal_identity = true
  from private.rc5_reveal_identity_backfill b
 where b.user_id = pr.id
   and pr.reveal_identity = false
   and pr.reveal_identity_chosen_at is null;
