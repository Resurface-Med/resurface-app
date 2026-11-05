-- "Hide answer options until I'm ready" (2026-11-05): cover the options
-- until you've thought of an answer, so you recall it rather than pick it
-- out. Off unless someone turns it on in Profile.
alter table public.profiles add column if not exists hide_options boolean not null default false;
