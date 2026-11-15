-- "Show who's doing questions now" (2026-11-15): the live strip in
-- sessions. On until its cross is pressed; Settings › Study turns it back on.
alter table public.profiles add column if not exists show_live boolean not null default true;
