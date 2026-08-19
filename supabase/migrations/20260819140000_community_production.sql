-- ============================================================================
-- The Traders Planet App — production Community feeds + retention
--
-- Builds on the backend-foundation and chat migrations. Additive only.
--
-- Adds: R2 attachment metadata on posts, single-query feed/comment readers
-- (so a feed render is one round trip rather than N+1), and a 6-month
-- retention sweep for community posts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- posts: R2 attachment metadata
--
-- `attachment` already records WHAT kind of thing is attached; these columns
-- record WHERE it lives, mirroring the chat messages layout so the same
-- two-phase purge pattern works for both.
-- ----------------------------------------------------------------------------

alter table public.posts
  add column if not exists storage_key text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists file_name text,
  add column if not exists media_purged boolean not null default false;

alter table public.comments
  add column if not exists client_id text;

create unique index if not exists comments_client_id_key
  on public.comments (post_id, client_id)
  where client_id is not null;

-- Feed pagination walks backwards from newest within a channel.
create index if not exists posts_channel_paging_idx
  on public.posts (channel, created_at desc, id desc);

create index if not exists comments_post_paging_idx
  on public.comments (post_id, created_at desc, id desc);

-- Realtime UPDATE/DELETE events need the old row to reconcile against.
alter table public.posts replica identity full;
alter table public.comments replica identity full;
alter table public.likes replica identity full;

-- ----------------------------------------------------------------------------
-- Feed reader
--
-- One query returns the page plus its author, counts and whether the caller
-- liked each row. Doing this client-side would be a query per post per counter.
--
-- SECURITY INVOKER: posts RLS still decides which rows are visible.
-- ----------------------------------------------------------------------------

create or replace function public.posts_feed(
  p_channel public.post_channel,
  p_before timestamptz default null,
  p_limit int default 20
)
returns table (
  id uuid,
  author_id uuid,
  channel public.post_channel,
  title text,
  body text,
  instrument text,
  entry_price numeric,
  stop_loss numeric,
  take_profit numeric,
  attachment public.attachment_kind,
  storage_key text,
  mime_type text,
  size_bytes bigint,
  file_name text,
  media_purged boolean,
  chart_seed int,
  is_anonymous boolean,
  display_name text,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  author_role public.user_role,
  is_mine boolean,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean
)
language sql
stable
set search_path = public
as $$
  select
    p.id, p.author_id, p.channel, p.title, p.body,
    p.instrument, p.entry_price, p.stop_loss, p.take_profit,
    p.attachment, p.storage_key, p.mime_type, p.size_bytes, p.file_name, p.media_purged,
    p.chart_seed, p.is_anonymous, p.display_name, p.created_at, p.updated_at,
    -- Admins always see the real name, even on an anonymous post; everyone
    -- else gets the snapshotted display_name. Matches the Phase 2A model.
    case when public.is_admin() then coalesce(pr.full_name, p.display_name) else p.display_name end,
    pr.role,
    p.author_id = auth.uid(),
    (select count(*) from public.likes l where l.post_id = p.id),
    (select count(*) from public.comments c where c.post_id = p.id),
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid())
  from public.posts p
  left join public.profiles pr on pr.id = p.author_id
  where p.channel = p_channel
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc, p.id desc
  limit least(coalesce(p_limit, 20), 50);
$$;

create or replace function public.post_comments(
  p_post_id uuid,
  p_before timestamptz default null,
  p_limit int default 20
)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  body text,
  voice_url text,
  voice_duration_seconds int,
  is_anonymous boolean,
  display_name text,
  created_at timestamptz,
  author_name text,
  is_mine boolean
)
language sql
stable
set search_path = public
as $$
  select
    c.id, c.post_id, c.author_id, c.body, c.voice_url, c.voice_duration_seconds,
    c.is_anonymous, c.display_name, c.created_at,
    case when public.is_admin() then coalesce(pr.full_name, c.display_name) else c.display_name end,
    c.author_id = auth.uid()
  from public.comments c
  left join public.profiles pr on pr.id = c.author_id
  where c.post_id = p_post_id
    and (p_before is null or c.created_at < p_before)
  order by c.created_at desc, c.id desc
  limit least(coalesce(p_limit, 20), 50);
$$;

-- Unread notification badge, as one cheap count.
create or replace function public.my_unread_notification_count()
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*) from public.notifications
  where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6-month retention for community posts
--
-- NOTE: no retention rule existed before this migration — this establishes it.
--
-- Same two-phase shape as chat media: the database nominates what to remove,
-- the server deletes the R2 objects, then the rows go. Splitting it means a
-- failed R2 call can't orphan objects that the database has already forgotten.
-- ----------------------------------------------------------------------------

create or replace function public.community_retention_cutoff()
returns timestamptz
language sql
immutable
as $$
  select (now() - interval '6 months')::timestamptz;
$$;

/** Posts past the cutoff that still hold an R2 object. Call before deleting. */
create or replace function public.select_expired_post_media()
returns table (id uuid, storage_key text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.storage_key
  from public.posts p
  where p.created_at < public.community_retention_cutoff()
    and p.storage_key is not null
    and not p.media_purged;
$$;

/**
 * Deletes every post past the 6-month cutoff. Comments and likes disappear with
 * them via ON DELETE CASCADE. Returns how many posts went.
 *
 * Run select_expired_post_media() and clear those objects from R2 first,
 * otherwise the bucket keeps paying for files nothing references.
 */
create or replace function public.purge_expired_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.posts where created_at < public.community_retention_cutoff();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/** Marks post media as purged without deleting the post (used when R2 objects
 *  are cleared ahead of the row delete, and by the media-quota path). */
create or replace function public.mark_post_media_purged(p_post_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post_ids is null or array_length(p_post_ids, 1) is null then
    return;
  end if;
  update public.posts
  set media_purged = true, storage_key = null, size_bytes = 0
  where id = any (p_post_ids);
end;
$$;

-- Scheduling: if pg_cron is enabled on the project, this runs the sweep nightly
-- at 03:15 UTC. Wrapped in a guard so the migration still applies on projects
-- without the extension — see supabase/README.md for the external-scheduler
-- alternative, which is also what clears the R2 objects.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'traders-planet-community-retention',
      '15 3 * * *',
      $cron$ select public.purge_expired_posts(); $cron$
    );
  end if;
end $$;
