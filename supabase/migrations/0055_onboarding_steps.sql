-- Where a new account gets to, step by step (2026-10-26).
--
-- Until now the only signals were "signed up" and "answered something", so a
-- stalled account could only be guessed at. One row per person per step, the
-- first time they reach it:
--   note_shown    the welcome note played
--   note_start    pressed its "Start Year N questions"
--   first_start   started their first session
--   first_done    reached the end of their first session
--   remind_on / remind_later / remind_ios   what they did with the reminder offer
-- Write-only for the person; read by admins through SQL.

create table public.onboarding_steps (
  user_id uuid not null references auth.users(id) on delete cascade,
  step    text not null check (step ~ '^[a-z_]{1,32}$'),
  at      timestamptz not null default now(),
  primary key (user_id, step)
);

alter table public.onboarding_steps enable row level security;

create policy "own onboarding steps" on public.onboarding_steps
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
