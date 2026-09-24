-- Keep keys until R2 deletion succeeds. The media signer rejects deleted rows,
-- so these keys are available to the cleanup route but not to clients.
create or replace function public.scrub_deleted_message()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := null;
    new.media_url := null;
    new.file_name := null;
  end if;
  return new;
end;
$$;
