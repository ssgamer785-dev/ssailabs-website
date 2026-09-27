-- Add exact targets to future notifications. Existing rows retain their post/thread destination.
alter table public.notifications
  add column if not exists related_message_id uuid references public.messages(id) on delete set null,
  add column if not exists related_comment_id uuid references public.comments(id) on delete set null;

create or replace function public.notify_message_recipients(
  p_conversation_id uuid, p_sender_id uuid, p_body text, p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid;
begin
  select student_id into v_student from public.conversations where id = p_conversation_id;
  if public.is_admin(p_sender_id) then
    if p_sender_id is distinct from v_student then
      insert into public.notifications (user_id, kind, title, body, related_conversation_id, related_message_id)
      values (v_student, 'chat', 'Admin sent you a message', coalesce(p_body, 'New message'), p_conversation_id, p_message_id);
    end if;
  else
    insert into public.notifications (user_id, kind, title, body, related_conversation_id, related_message_id)
    select p.id, 'chat', 'New message from a student', coalesce(p_body, 'New message'), p_conversation_id, p_message_id
    from public.profiles p where p.role = 'admin';
  end if;
end;
$$;

revoke execute on function public.notify_message_recipients(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.notify_message_recipients(uuid, uuid, text, uuid) to service_role;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.upload_status = 'ready' then
    perform public.notify_message_recipients(new.conversation_id, new.sender_id, new.body, new.id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_completed_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.upload_status = 'pending' and new.upload_status = 'ready' and new.deleted_at is null then
    perform public.notify_message_recipients(new.conversation_id, new.sender_id, new.body, new.id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is distinct from new.author_id then
    insert into public.notifications (user_id, kind, title, body, related_post_id, related_comment_id)
    values (v_author, 'comment', new.display_name || ' commented on your post', coalesce(new.body, 'Sent a voice note'), new.post_id, new.id);
  end if;
  return new;
end;
$$;
