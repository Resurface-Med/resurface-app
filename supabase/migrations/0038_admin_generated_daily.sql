-- Who generated questions on a day, for the Admin calendar. The chart
-- already has the day's total; this is the people behind it. The day is
-- London time, which is the calendar that page is read on.

create or replace function public.admin_generated_daily(days integer default 180)
returns table(user_id uuid, day date, questions bigint)
language sql stable security definer set search_path = public as $$
  select g.user_id,
         (g.created_at at time zone 'Europe/London')::date,
         count(*)
  from public.generated_questions g
  where public.is_admin() and g.created_at >= (now() - make_interval(days => days))
  group by g.user_id, (g.created_at at time zone 'Europe/London')::date
  order by 2
$$;

revoke all on function public.admin_generated_daily(integer) from public;
grant execute on function public.admin_generated_daily(integer) to authenticated;
