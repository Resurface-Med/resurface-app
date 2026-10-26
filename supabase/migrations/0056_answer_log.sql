-- Every answer as its own row (2026-10-26).
--
-- practice_stats keeps one running total per person and question, updated in
-- place, so when, in what order and how fast are lost. This keeps them, for
-- retention by signup week, questions that are answered too fast or got
-- wrong by strong students, and whether a wrong answer is right when it
-- comes back. History can't be filled in later, so it starts now.
--
-- Built small because the free database is 500 MB (Rafil's concern):
--   * numbers and ids only, no text: about 60 bytes a row. At ~2,600
--     answers a week that is ~9 MB a year.
--   * one BRIN index on the time, a few KB however large the table gets;
--     lookups by person or question scan, which is fine at this size.
--   * monthly, anything over a year old is folded into answer_weekly (one
--     row per person, question and week) and deleted from here.
-- Insert-only for the person; read by admins through SQL.

create table public.answer_log (
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id integer not null,
  correct     boolean not null,
  ms          integer check (ms is null or ms between 0 and 3600000),  -- time to answer
  at          timestamptz not null default now()
);
create index answer_log_at on public.answer_log using brin (at);

alter table public.answer_log enable row level security;
create policy "own answers" on public.answer_log
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create table public.answer_weekly (
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id integer not null,
  week        date not null,           -- Monday of the week
  n           smallint not null,
  correct     smallint not null,
  ms_median   integer,
  primary key (user_id, question_id, week)
);
alter table public.answer_weekly enable row level security;  -- no policies: admins via SQL only

create or replace function public.fold_old_answers()
returns void language sql security definer set search_path = public as $$
  with old as (
    delete from public.answer_log where at < now() - interval '365 days' returning *
  )
  insert into public.answer_weekly (user_id, question_id, week, n, correct, ms_median)
  select user_id, question_id, date_trunc('week', at)::date, count(*), count(*) filter (where correct),
         (percentile_cont(0.5) within group (order by ms))::integer
  from old group by 1, 2, 3
  on conflict (user_id, question_id, week) do update
    set n = answer_weekly.n + excluded.n, correct = answer_weekly.correct + excluded.correct;
$$;
revoke all on function public.fold_old_answers() from public, anon, authenticated;

select cron.schedule('fold-old-answers', '30 3 1 * *', $$select public.fold_old_answers()$$);
