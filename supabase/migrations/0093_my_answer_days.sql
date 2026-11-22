-- Right and wrong per day, for the Progress page (2026-11-22).
--
-- The page's week chart and accuracy line need right and wrong by day. The
-- activity table counts answers only, so this reads the caller's own rows of
-- answer_log, by UK calendar day, for the last 16 weeks.

create index if not exists answer_log_user_at on public.answer_log (user_id, at);

create or replace function public.my_answer_days(days integer default 112)
returns table(day date, answered integer, correct integer)
language sql stable security definer set search_path to 'public' as $$
  select (a.at at time zone 'Europe/London')::date,
         count(*)::int,
         count(*) filter (where a.correct)::int
    from public.answer_log a
   where a.user_id = auth.uid()
     and a.at >= now() - make_interval(days => least(greatest(days, 1), 400))
   group by 1
   order by 1
$$;

revoke all on function public.my_answer_days(integer) from public, anon;
grant execute on function public.my_answer_days(integer) to authenticated;
