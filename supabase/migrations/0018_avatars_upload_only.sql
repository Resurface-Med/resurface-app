-- Profile photos are only the ones uploaded to Resurface (Rafil,
-- 2026-10-18): a Google account's photo is no longer used. avatar_v above
-- zero is an upload; anything else is initials.
create or replace function public.avatar_of(v integer, meta jsonb)
returns text language sql immutable as $$
  select case when v > 0 then 'v' || v end;
$$;
