-- How long "Loading your progress…" takes, phase by phase (2026-10-17).
-- It is sometimes slow and the database is not why (every load query runs in
-- under 10ms), so each sign-in load records where its time went. Timings and
-- the kind of device only — no content. Anyone signed in may add their own
-- row; nobody can read them through the API (no select policy); read with SQL.
create table if not exists public.load_timings (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  total_ms integer not null,
  phases jsonb not null,
  standalone boolean,
  phone boolean,
  online_type text
);
alter table public.load_timings enable row level security;
create policy "insert own load timing" on public.load_timings
  for insert to authenticated with check (user_id = auth.uid());
create index if not exists load_timings_created_at on public.load_timings (created_at desc);
