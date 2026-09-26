-- Additive enum extension. Existing messages are unchanged.
alter type public.message_kind add value if not exists 'file';
