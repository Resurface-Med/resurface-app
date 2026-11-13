-- "Show where each question is from" (2026-11-13): a line over the
-- question naming its deck path. Off unless someone turns it on in
-- Settings › Study.
alter table public.profiles add column if not exists show_source boolean not null default false;
