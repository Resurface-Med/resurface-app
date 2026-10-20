-- Past sessions removed (Rafil, 2026-10-20): the feature from 0027 is gone
-- from the app, so its table and triggers go too.

drop table if exists public.practice_sessions;
drop function if exists public.practice_sessions_keep_newest();
drop function if exists public.practice_sessions_prune();
