-- Whether the intro film has played for this person (2026-10-15). It plays
-- once, by itself, on an empty account's first dashboard; on the profile so
-- a second device does not play it again.
alter table public.profiles
  add column if not exists intro_seen boolean not null default false;
