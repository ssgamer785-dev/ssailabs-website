-- ---------------------------------------------------------------------------
-- Phase 1 (2 of 2): post detail, polls, profile avatars, admin conversations.
--
-- ADDITIVE ONLY. No DROP TABLE, no TRUNCATE, no DELETE, no column removed, no
-- existing policy replaced. Everything here either creates something new or
-- replaces a function body with one that returns a superset of what it did.
--
-- What it adds, and why each piece has to exist:
--
--   1. profiles.avatar_key   — the R2 key behind a profile picture. avatar_url
--                              already existed but holds a URL, and an R2
--                              object is private: it is reachable only through
--                              a short-lived signed GET, so what has to be
--                              stored is the key, not a URL that would be dead
--                              within the hour.
--   2. post_by_id()          — the feed's row shape for exactly one post. The
--                              detail screen had no way to ask for a single
--                              post with its counts, author name and
--                              liked/bookmarked state resolved, so it was
--                              querying `posts` directly and inventing the
--                              rest.
--   3. poll_options/_votes   — attachment_kind has had a 'poll' member since
--                              the first migration with nothing behind it. A
--                              poll needs somewhere to keep its options and
--                              one vote per person.
--   4. admin_conversations() — the admin inbox listed four hard-coded names.
--                              This is the real list.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Profile pictures
-- ===========================================================================

alter table public.profiles
  add column if not exists avatar_key text;

comment on column public.profiles.avatar_key is
  'R2 object key for this profile picture, under avatars/<uid>/. Private: read '
  'through a signed GET only. NULL means the initials placeholder is shown.';


-- ===========================================================================
-- 2. One post, with everything the detail screen needs
--
-- SECURITY INVOKER (the default) and STABLE, exactly like posts_feed: RLS
-- decides whether the caller may see this row, and this function never widens
-- that. The only difference from a posts_feed row is bookmarked_by_me, which
-- the feed has no use for and the detail screen cannot render without.
-- ===========================================================================

create or replace function public.post_by_id(p_post_id uuid)
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
  poster_key text,
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
  author_avatar_key text,
  is_mine boolean,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean,
  bookmarked_by_me boolean
)
language sql
stable
set search_path = public
as $$
  select
    p.id, p.author_id, p.channel, p.title, p.body,
    p.instrument, p.entry_price, p.stop_loss, p.take_profit,
    p.attachment, p.storage_key, p.poster_key, p.mime_type, p.size_bytes,
    p.file_name, p.media_purged,
    p.chart_seed, p.is_anonymous, p.display_name, p.created_at, p.updated_at,
    -- Identical rule to posts_feed: an admin always sees the real name, every
    -- other reader sees the name snapshotted onto the post when it was made.
    case when public.is_admin() then coalesce(pr.full_name, p.display_name) else p.display_name end,
    pr.role,
    -- The author's picture is withheld on an anonymous post for anyone but an
    -- admin. A face is an identity; showing it beside "Unknown User" would
    -- undo the whole setting.
    case when p.is_anonymous and not public.is_admin() then null else pr.avatar_key end,
    p.author_id = auth.uid(),
    (select count(*) from public.likes l where l.post_id = p.id),
    (select count(*) from public.comments c where c.post_id = p.id),
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists (select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = auth.uid())
  from public.posts p
  left join public.profiles pr on pr.id = p.author_id
  where p.id = p_post_id;
$$;

comment on function public.post_by_id(uuid) is
  'One post in the posts_feed row shape, plus bookmarked_by_me and the '
  'author''s avatar key. SECURITY INVOKER: RLS still decides visibility.';


-- ===========================================================================
-- 3. Polls
-- ===========================================================================

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  -- 0-based, and what the options are ordered by. Kept explicit rather than
  -- ordering by created_at, because two options inserted in the same statement
  -- can share a timestamp and would then shuffle between reads.
  --
  -- Named sort_order, not `position`: POSITION is a reserved word in Postgres
  -- and, while it is accepted in a CREATE TABLE column list, it is a syntax
  -- error in a RETURNS TABLE list — so a column called `position` would parse
  -- here and then break the first function that tried to return it.
  sort_order smallint not null,
  label text not null,
  created_at timestamptz not null default now(),
  constraint poll_options_label_length check (char_length(btrim(label)) between 1 and 120),
  constraint poll_options_sort_order_range check (sort_order >= 0 and sort_order <= 9),
  constraint poll_options_unique_sort_order unique (post_id, sort_order),
  -- Referenced by the composite foreign key on poll_votes below, which is what
  -- makes "this vote's option belongs to this vote's poll" a database
  -- guarantee rather than something every caller has to remember to check.
  constraint poll_options_id_post unique (id, post_id)
);

create index if not exists poll_options_post_idx on public.poll_options (post_id, sort_order);

comment on table public.poll_options is
  'The choices on a post whose attachment is ''poll''. Ordered by sort_order.';

create table if not exists public.poll_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  option_id uuid not null,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One vote per person per poll, enforced by the key itself. Changing your
  -- mind is an UPDATE of this row, so a second vote cannot be stuffed in
  -- alongside the first however the request is shaped.
  primary key (post_id, voter_id),
  -- Composite, not a plain reference to poll_options(id): this is what makes
  -- it impossible to record a vote for an option belonging to another poll.
  constraint poll_votes_option_in_poll
    foreign key (option_id, post_id)
    references public.poll_options (id, post_id) on delete cascade
);

create index if not exists poll_votes_option_idx on public.poll_votes (option_id);

comment on table public.poll_votes is
  'One row per person per poll. Readable only by its owner and admins; '
  'everyone else sees aggregate counts through poll_results().';


-- ---- RLS ------------------------------------------------------------------

alter table public.poll_options enable row level security;
alter table public.poll_votes   enable row level security;

do $$
begin
  -- Options are part of the post, so they follow the post's own visibility:
  -- readable by an activated member, writable by the post's author.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_options' and policyname = 'poll_options_select_activated') then
    create policy "poll_options_select_activated"
      on public.poll_options for select to authenticated
      using (public.is_activated());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_options' and policyname = 'poll_options_write_author') then
    create policy "poll_options_write_author"
      on public.poll_options for insert to authenticated
      with check (
        exists (
          select 1 from public.posts p
           where p.id = poll_options.post_id
             and p.author_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_options' and policyname = 'poll_options_delete_author_or_admin') then
    create policy "poll_options_delete_author_or_admin"
      on public.poll_options for delete to authenticated
      using (
        public.is_admin()
        or exists (
          select 1 from public.posts p
           where p.id = poll_options.post_id
             and p.author_id = auth.uid()
        )
      );
  end if;

  -- A vote is private. You can read your own; an admin can read all, which is
  -- what lets them see who has responded. Nobody else can read any, which is
  -- why aggregate counts have to come from poll_results() below.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_votes' and policyname = 'poll_votes_select_own_or_admin') then
    create policy "poll_votes_select_own_or_admin"
      on public.poll_votes for select to authenticated
      using (voter_id = auth.uid() or public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_votes' and policyname = 'poll_votes_insert_own') then
    create policy "poll_votes_insert_own"
      on public.poll_votes for insert to authenticated
      with check (voter_id = auth.uid() and public.is_activated());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_votes' and policyname = 'poll_votes_update_own') then
    create policy "poll_votes_update_own"
      on public.poll_votes for update to authenticated
      using (voter_id = auth.uid())
      with check (voter_id = auth.uid() and public.is_activated());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_votes' and policyname = 'poll_votes_delete_own') then
    create policy "poll_votes_delete_own"
      on public.poll_votes for delete to authenticated
      using (voter_id = auth.uid());
  end if;
end $$;


-- ---- reading a poll -------------------------------------------------------

/**
 * Options with their vote counts, and which one is the caller's.
 *
 * SECURITY DEFINER, because the point is to publish counts without publishing
 * votes: poll_votes RLS hides other people's rows, so an ordinary caller
 * counting them would get their own vote and nothing else. Running as the
 * owner lets the count be right while individual votes stay unreadable.
 *
 * The activation check is therefore not decoration — it is the gate that
 * SECURITY DEFINER just stepped around.
 */
create or replace function public.poll_results(p_post_id uuid)
returns table (
  option_id uuid,
  sort_order smallint,
  label text,
  vote_count bigint,
  is_my_vote boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_activated(v_uid) then
    return;
  end if;

  return query
    select
      o.id,
      o.sort_order,
      o.label,
      (select count(*) from public.poll_votes v where v.option_id = o.id),
      exists (
        select 1 from public.poll_votes v
         where v.post_id = p_post_id and v.voter_id = v_uid and v.option_id = o.id
      )
    from public.poll_options o
    where o.post_id = p_post_id
    order by o.sort_order;
end;
$$;


-- ---- voting ---------------------------------------------------------------

/**
 * Records, or changes, the caller's vote.
 *
 * The option is looked up by (id, post_id) rather than id alone, so an option
 * belonging to a different poll cannot be voted onto this one — the composite
 * foreign key would reject it anyway, but failing here gives a usable answer
 * instead of a constraint violation.
 *
 * ON CONFLICT on the primary key is what makes changing your mind a single
 * statement: no read-then-write, so two taps in quick succession cannot leave
 * two rows or lose one.
 */
create or replace function public.cast_poll_vote(p_post_id uuid, p_option_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if not public.is_activated(v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_activated');
  end if;
  if not exists (
    select 1 from public.poll_options o
     where o.id = p_option_id and o.post_id = p_post_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_option');
  end if;

  insert into public.poll_votes (post_id, option_id, voter_id)
  values (p_post_id, p_option_id, v_uid)
  on conflict (post_id, voter_id)
  do update set option_id = excluded.option_id, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;


-- ---- creating a poll ------------------------------------------------------

/**
 * A poll post and its options, in one statement.
 *
 * SECURITY INVOKER on purpose. The post insert therefore still passes through
 * the posts RLS policy and the posts_guard_channel trigger, which is what
 * stops a non-admin creating an Official poll — moving that check in here
 * would mean maintaining a second copy of a rule that already exists.
 *
 * Atomic because a function body is one transaction: a post can never end up
 * in the feed marked 'poll' with no options under it.
 */
create or replace function public.create_poll_post(
  p_channel public.post_channel,
  p_question text,
  p_options text[],
  p_is_anonymous boolean default false
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post_id uuid;
  v_clean text[];
  v_label text;
  v_index int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(btrim(p_question), '') = '' then
    raise exception 'A poll needs a question';
  end if;

  -- Blank entries are dropped rather than rejected: the composer always sends
  -- a fixed number of option fields and the person simply may not have filled
  -- them all in, which is not an error.
  select array_agg(btrim(o))
    into v_clean
    from unnest(p_options) as o
   where coalesce(btrim(o), '') <> '';

  if v_clean is null or array_length(v_clean, 1) < 2 then
    raise exception 'A poll needs at least two options';
  end if;
  if array_length(v_clean, 1) > 10 then
    raise exception 'A poll can have at most ten options';
  end if;

  insert into public.posts (author_id, channel, title, body, attachment, is_anonymous)
  values (
    v_uid,
    p_channel,
    case when p_channel = 'official' then btrim(p_question) else null end,
    btrim(p_question),
    'poll',
    case when p_channel = 'students' then coalesce(p_is_anonymous, false) else false end
  )
  returning id into v_post_id;

  foreach v_label in array v_clean loop
    insert into public.poll_options (post_id, sort_order, label)
    values (v_post_id, v_index, v_label);
    v_index := v_index + 1;
  end loop;

  return v_post_id;
end;
$$;


-- ===========================================================================
-- 4. The admin's conversation list
--
-- SECURITY DEFINER with an is_admin() gate at the top. It has to be: it reads
-- across every activated member's profile and their whole conversation, which
-- is precisely what RLS stops an ordinary caller doing. The gate is the only
-- thing standing between a student and this data, so it comes first and
-- returns empty rather than raising — a student calling it learns nothing
-- about whether it exists.
-- ===========================================================================

create or replace function public.admin_conversations()
returns table (
  student_id uuid,
  full_name text,
  avatar_key text,
  reveal_identity boolean,
  activated_at timestamptz,
  conversation_id uuid,
  unread_count bigint,
  last_message_at timestamptz,
  last_message_preview text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return;
  end if;

  return query
    select
      pr.id,
      pr.full_name,
      pr.avatar_key,
      pr.reveal_identity,
      pr.activated_at,
      c.id,
      coalesce((
        select count(*) from public.messages m
         where m.conversation_id = c.id
           and m.sender_id <> auth.uid()
           and m.read_at is null
           and m.deleted_at is null
      ), 0),
      c.last_message_at,
      (
        select case
          when m.deleted_at is not null then 'This message was deleted'
          when m.kind = 'text' then m.body
          when m.kind = 'voice' then 'Voice message'
          when m.kind = 'image' then 'Photo'
          when m.kind = 'video' then 'Video'
          when m.kind = 'pdf' then coalesce(m.file_name, 'PDF')
          else 'Attachment'
        end
        from public.messages m
        where m.conversation_id = c.id
        order by m.created_at desc, m.id desc
        limit 1
      )
    from public.profiles pr
    left join public.conversations c on c.student_id = pr.id
    where pr.role = 'student'
      and pr.activated_at is not null
    -- Threads with traffic first, then everyone else alphabetically, so a new
    -- member is findable rather than buried under whoever wrote most recently.
    order by c.last_message_at desc nulls last, lower(pr.full_name) asc;
end;
$$;

/**
 * The conversation with one member, creating it if this is the first contact.
 *
 * Without this an admin can only reply to someone who wrote first: the
 * conversations insert policy keys the row to auth.uid(), so an admin
 * inserting a row for a student's thread is refused. This is the one narrow
 * place that is allowed to do it, and it is admin-gated and idempotent.
 */
create or replace function public.admin_open_conversation(p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_student_id and p.activated_at is not null
  ) then
    raise exception 'That member is not activated';
  end if;

  select c.id into v_id from public.conversations c where c.student_id = p_student_id;
  if v_id is not null then
    return v_id;
  end if;

  -- student_id is UNIQUE, so a concurrent first message from the member
  -- themselves races us here; ON CONFLICT turns that into the same answer
  -- rather than a duplicate-key error.
  insert into public.conversations (student_id)
  values (p_student_id)
  on conflict (student_id) do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id from public.conversations c where c.student_id = p_student_id;
  end if;

  return v_id;
end;
$$;


-- ===========================================================================
-- 5. Grants
--
-- Everything is granted to `authenticated`, which is the role every signed-in
-- session runs as — including the admin's. The authorization is the is_admin()
-- / is_activated() check inside each body, never the grant.
-- ===========================================================================

grant execute on function public.post_by_id(uuid)                                  to authenticated, service_role;
grant execute on function public.poll_results(uuid)                                to authenticated, service_role;
grant execute on function public.cast_poll_vote(uuid, uuid)                        to authenticated, service_role;
grant execute on function public.create_poll_post(public.post_channel, text, text[], boolean) to authenticated, service_role;
grant execute on function public.admin_conversations()                             to authenticated, service_role;
grant execute on function public.admin_open_conversation(uuid)                      to authenticated, service_role;

grant select                   on public.poll_options to authenticated;
grant insert, delete           on public.poll_options to authenticated;
grant select, insert, update, delete on public.poll_votes to authenticated;
