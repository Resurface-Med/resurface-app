-- A streak on the board is the streak as it stands today (2026-10-15).
--
-- streaks.current only changes when someone answers, so a streak that ended
-- a week ago was still shown at its old length. Studied today or yesterday it
-- is running; otherwise it is 0. A day of slack either side of UTC, because
-- last_date is the student's local date and current_date is the server's.
create or replace function public.leaderboard_week()
 returns table(user_id uuid, display_name text, week_count integer, streak integer, rank bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with ranked as (
    select
      p.id as user_id,
      trim(p.display_name) as display_name,
      coalesce(sum(a.count), 0)::integer as week_count,
      (case when s.last_date >= current_date - 1 then coalesce(s.current, 0) else 0 end)::integer as streak
    from public.profiles p
    left join public.activity a
      on a.user_id = p.id
     and a.day >= (current_date - 6)
    left join public.streaks s
      on s.user_id = p.id
    where p.show_on_leaderboard = true
      and p.display_name is not null
      and length(trim(p.display_name)) > 0
    group by p.id, p.display_name, s.current, s.last_date
  )
  select
    r.user_id,
    r.display_name,
    r.week_count,
    r.streak,
    rank() over (order by r.week_count desc, r.streak desc, r.display_name asc) as rank
  from ranked r
  order by rank asc, r.display_name asc
  limit 100;
$function$;
