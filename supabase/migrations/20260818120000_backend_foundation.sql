-- ============================================================================
-- The Traders Planet App — backend foundation
--
-- Profiles + Admin/Student roles, community posts, comments, likes, bookmarks,
-- admin<->student chat, and notifications, with Row Level Security throughout
-- and Realtime enabled on the tables that need live updates.
--
-- This is the first migration for this project: it only creates new objects
-- and is safe to run against an otherwise-empty Supabase project. Nothing here
-- drops or rewrites existing data.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type public.user_role as enum ('admin', 'student');
create type public.post_channel as enum ('official', 'students');
create type public.attachment_kind as enum ('none', 'image', 'video', 'pdf', 'poll', 'chart');
create type public.message_kind as enum ('text', 'image', 'pdf', 'chart', 'voice');
create type public.notification_kind as enum ('signal', 'chat', 'like', 'comment', 'target', 'session');

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles  (one row per auth.users; role drives Admin/Student access)
-- ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default 'New Trader',
  phone text,
  role public.user_role not null default 'student',
  reveal_identity boolean not null default false,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per authenticated user; role gates Admin vs Student access everywhere else.';
comment on column public.profiles.reveal_identity is
  'Default "post with my real name" preference. Individual posts snapshot their own is_anonymous, so this is just the starting value for new posts.';

-- Defined here, after profiles exists: a LANGUAGE sql body is name-resolved at
-- CREATE time, so this cannot be hoisted into the helpers section above.
-- SECURITY DEFINER so RLS policies can call it without recursing back into
-- profiles' own RLS (which would otherwise deadlock the check).
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up (standard Supabase pattern).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only an existing admin may change someone's role (prevents self-promotion).
-- auth.uid() is null outside an end-user request — the SQL editor, a migration,
-- or a service-role call — and those are trusted, which is also how the very
-- first admin gets promoted (see supabase/README.md).
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin(auth.uid()) then
    raise exception 'Only admins can change a profile''s role';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update of role on public.profiles
  for each row execute function public.prevent_role_self_escalation();

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- No insert policy: rows are only created by the handle_new_user trigger above.

-- ----------------------------------------------------------------------------
-- posts  (Official = admin-authored, Students = the students' own feed)
-- ----------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  channel public.post_channel not null default 'students',
  title text,
  body text,
  instrument text,
  entry_price numeric,
  stop_loss numeric,
  take_profit numeric,
  attachment public.attachment_kind not null default 'none',
  attachment_url text,
  chart_seed int,
  is_anonymous boolean not null default false,
  display_name text not null default 'Unknown User',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.posts.display_name is
  'Plain-text name shown to viewers who are not the author and not an admin: the author''s name at post time, or "Unknown User" when is_anonymous. Admins resolve the real author via author_id -> profiles regardless of this value, matching "admins always see your real name".';

create index posts_channel_created_idx on public.posts (channel, created_at desc);
create index posts_author_idx on public.posts (author_id);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- Shared by posts and comments: snapshot a display name from the author's
-- profile, masked to "Unknown User" when the row is posted anonymously.
create or replace function public.snapshot_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
begin
  select full_name into author_name from public.profiles where id = new.author_id;
  new.display_name := case when new.is_anonymous then 'Unknown User' else coalesce(author_name, 'Unknown User') end;
  return new;
end;
$$;

create trigger posts_snapshot_display_name
  before insert or update of is_anonymous on public.posts
  for each row execute function public.snapshot_display_name();

-- Only admins may write to (or move a post into) the Official channel — checked
-- again here as a trigger, in addition to the insert policy below, so it also
-- covers UPDATE (RLS alone can't tell which columns changed).
create or replace function public.guard_post_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.channel = 'official' and not public.is_admin(auth.uid()) then
    raise exception 'Only admins can post to the Official channel';
  end if;
  return new;
end;
$$;

create trigger posts_guard_channel
  before insert or update of channel on public.posts
  for each row execute function public.guard_post_channel();

alter table public.posts enable row level security;

create policy "posts_select_authenticated"
  on public.posts for select
  to authenticated
  using (true);

create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (channel = 'students' or public.is_admin())
  );

create policy "posts_update_own_or_admin"
  on public.posts for update
  to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy "posts_delete_own_or_admin"
  on public.posts for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- comments  (on posts; supports text or a voice note, same anonymity model)
-- ----------------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text,
  voice_url text,
  voice_duration_seconds int,
  is_anonymous boolean not null default false,
  display_name text not null default 'Unknown User',
  created_at timestamptz not null default now(),
  constraint comments_body_or_voice check (body is not null or voice_url is not null)
);

create index comments_post_idx on public.comments (post_id, created_at);

create trigger comments_snapshot_display_name
  before insert on public.comments
  for each row execute function public.snapshot_display_name();

alter table public.comments enable row level security;

create policy "comments_select_authenticated"
  on public.comments for select
  to authenticated
  using (true);

create policy "comments_insert_own"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "comments_update_own_or_admin"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy "comments_delete_own_or_admin"
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- likes / bookmarks
-- ----------------------------------------------------------------------------

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.likes enable row level security;

create policy "likes_select_authenticated" on public.likes for select to authenticated using (true);
create policy "likes_insert_own" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes_delete_own" on public.likes for delete to authenticated using (user_id = auth.uid());

create table public.bookmarks (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

comment on table public.bookmarks is 'Private per-user saves — unlike likes, never exposed to other users.';

alter table public.bookmarks enable row level security;

create policy "bookmarks_select_own" on public.bookmarks for select to authenticated using (user_id = auth.uid());
create policy "bookmarks_insert_own" on public.bookmarks for insert to authenticated with check (user_id = auth.uid());
create policy "bookmarks_delete_own" on public.bookmarks for delete to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- conversations / messages  (each student has exactly one thread with Admin;
-- "direct member chat is off" so there is no student<->student messaging)
-- ----------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index conversations_last_message_idx on public.conversations (last_message_at desc);

alter table public.conversations enable row level security;

create policy "conversations_select_own_or_admin"
  on public.conversations for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

create policy "conversations_insert_own"
  on public.conversations for insert
  to authenticated
  with check (student_id = auth.uid());

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind public.message_kind not null default 'text',
  body text,
  media_url text,
  voice_duration_seconds int,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_body_or_media check (body is not null or media_url is not null)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.student_id = auth.uid()
    )
  );

create policy "messages_insert_participant"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.student_id = auth.uid()
      )
    )
  );

-- Recipients mark messages read; senders keep read access via the select policy.
create policy "messages_update_participant"
  on public.messages for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.student_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.student_id = auth.uid()
    )
  );

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- ----------------------------------------------------------------------------
-- notifications  (rows are only ever written by the triggers below)
-- ----------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  related_post_id uuid references public.posts (id) on delete set null,
  related_conversation_id uuid references public.conversations (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No insert/delete policy for regular users — notifications are only created
-- by the SECURITY DEFINER triggers below, which bypass RLS to fan out safely.

create or replace function public.notify_new_official_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.channel = 'official' then
    insert into public.notifications (user_id, kind, title, body, related_post_id)
    select p.id, 'signal', coalesce(new.title, 'New Official Update posted'), coalesce(new.body, ''), new.id
    from public.profiles p
    where p.role = 'student';
  end if;
  return new;
end;
$$;

create trigger posts_notify_official
  after insert on public.posts
  for each row execute function public.notify_new_official_post();

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  select student_id into v_student from public.conversations where id = new.conversation_id;

  if public.is_admin(new.sender_id) then
    if new.sender_id is distinct from v_student then
      insert into public.notifications (user_id, kind, title, body, related_conversation_id)
      values (v_student, 'chat', 'Admin sent you a message', coalesce(new.body, 'New message'), new.conversation_id);
    end if;
  else
    insert into public.notifications (user_id, kind, title, body, related_conversation_id)
    select p.id, 'chat', 'New message from a student', coalesce(new.body, 'New message'), new.conversation_id
    from public.profiles p
    where p.role = 'admin';
  end if;
  return new;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();

create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is distinct from new.author_id then
    insert into public.notifications (user_id, kind, title, body, related_post_id)
    values (v_author, 'comment', new.display_name || ' commented on your post', coalesce(new.body, 'Sent a voice note'), new.post_id);
  end if;
  return new;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_new_comment();

create or replace function public.notify_new_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_liker_name text;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is distinct from new.user_id then
    select full_name into v_liker_name from public.profiles where id = new.user_id;
    insert into public.notifications (user_id, kind, title, body, related_post_id)
    values (v_author, 'like', coalesce(v_liker_name, 'Someone') || ' liked your post', '', new.post_id);
  end if;
  return new;
end;
$$;

create trigger likes_notify
  after insert on public.likes
  for each row execute function public.notify_new_like();

-- ----------------------------------------------------------------------------
-- Realtime — chat, community and notifications need live updates.
-- Guarded so re-running this migration (or a table already added via the
-- dashboard) doesn't error on "relation is already member of publication".
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['posts', 'comments', 'likes', 'messages', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
