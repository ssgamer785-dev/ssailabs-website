-- Kept separate so the value is committed before the next migration uses it.
alter type public.attachment_kind add value if not exists 'voice';
