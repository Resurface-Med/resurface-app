-- Show up to 160 people on the leaderboard (Rafil, 2026-11-15), up from 100.
create or replace function public.leaderboard_week(yr integer default null::integer, on_day date default null::date)
 returns table(user_id uuid, display_name text, week_count integer, streak integer, rank bigint, avatar text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with ranked as (
    select
      p.id as user_id,
      trim(p.display_name) as display_name,
      coalesce(sum(a.count), 0)::integer as week_count,
      (case when s.last_date >= current_date - 1 then coalesce(s.current, 0) else 0 end)::integer as streak,
      public.avatar_of(p.avatar_v, u.raw_user_meta_data) as avatar
    from public.profiles p
    join auth.users u
      on u.id = p.id
     and u.email_confirmed_at is not null
    left join public.activity a
      on a.user_id = p.id
     and case
           when on_day is null then a.day >= (current_date - 6)
           when on_day between current_date - 1 and current_date + 1 then a.day = on_day
           else false
         end
    left join public.streaks s
      on s.user_id = p.id
    where p.show_on_leaderboard = true
      and p.display_name is not null
      and length(trim(p.display_name)) > 0
      and (yr is null or p.study_year = yr)
      and auth.uid() is not null
    group by p.id, p.display_name, s.current, s.last_date, p.avatar_v, u.raw_user_meta_data
  )
  select r.user_id, r.display_name, r.week_count, r.streak,
         rank() over (order by r.week_count desc, r.streak desc, r.display_name asc) as rank,
         r.avatar
  from ranked r
  order by rank asc, r.display_name asc
  limit 160;
$function$;
