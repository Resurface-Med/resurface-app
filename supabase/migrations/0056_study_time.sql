-- Time studied (2026-10-26), shown on Home.
--
-- From here the app adds the seconds a question was actually on screen.
-- The number already on each profile is the study we can still see: each
-- saved session, from when it opened to its last answer, and never more
-- than two minutes a question (a tab left open overnight is not a night of
-- work). Answers from before those sessions, or from sessions already
-- pruned, are counted at that person's own pace, or at 24 seconds each
-- when they have no session to take a pace from — the median across the
-- sessions saved on the day this was added. Runs only while the column is
-- still 0, so applying it again does not add the history a second time.

alter table public.profiles
  add column if not exists study_seconds bigint not null default 0
  check (study_seconds >= 0);

with sess as (
  select user_id,
    sum(answered)::bigint as session_answers,
    sum(least(
      greatest(extract(epoch from (updated_at - created_at)), 0),
      answered * 120
    ))::bigint as secs,
    percentile_cont(0.5) within group (
      order by least(
        greatest(extract(epoch from (updated_at - created_at)), 0),
        answered * 120
      ) / nullif(answered, 0)
    ) filter (where answered > 0) as rate
  from public.practice_sessions
  group by user_id
), ans as (
  select user_id, sum(total)::bigint as answers
  from public.practice_stats
  group by user_id
), seeded as (
  select a.user_id,
    (
      coalesce(s.secs, 0)
      + greatest(0, a.answers - coalesce(s.session_answers, 0))
        * coalesce(round(s.rate), 24)
    )::bigint as secs
  from ans a
  left join sess s using (user_id)
)
update public.profiles p
   set study_seconds = seeded.secs
  from seeded
 where p.id = seeded.user_id
   and p.study_seconds = 0
   and seeded.secs > 0;

-- Absolute, and never downwards: a retry of an older total, or a second
-- tab that has not caught up, must not wipe time that is already in.
create or replace function public.set_study_seconds(secs bigint)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if secs is null or secs < 0 or secs > 100000000 then
    return;
  end if;
  update public.profiles
     set study_seconds = greatest(study_seconds, secs),
         updated_at = now()
   where id = auth.uid();
end;
$$;

revoke all on function public.set_study_seconds(bigint) from public, anon;
grant execute on function public.set_study_seconds(bigint) to authenticated;
