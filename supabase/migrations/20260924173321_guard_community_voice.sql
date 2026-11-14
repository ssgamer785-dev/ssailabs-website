-- A forged client request cannot post a voice attachment as a student.
create or replace function public.guard_community_voice()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.attachment = 'voice' and not public.is_admin(auth.uid()) then
    raise exception 'Only admins may post community voice messages';
  end if;
  return new;
end;
$$;

create trigger posts_guard_community_voice
before insert or update of attachment on public.posts
for each row execute function public.guard_community_voice();
