-- The leaderboard lists confirmed accounts only (2026-10-17).
--
-- A profile is made the moment someone signs up with an email, before they
-- have entered the code, so people who never confirmed were on the board
-- under their email's name (four university addresses held up by the delay
-- on their code). Now an account must have a confirmed email to appear;
-- Google sign-ins are confirmed by Google.

create or replace function public.leaderboard_week()
returns table(user_id uuid, display_name text, week_count integer, streak integer, rank bigint)
language sql stable security definer set search_path to 'public' as $$
  with ranked as (
    select
      p.id as user_id,
      trim(p.display_name) as display_name,
      coalesce(sum(a.count), 0)::integer as week_count,
      (case when s.last_date >= current_date - 1 then coalesce(s.current, 0) else 0 end)::integer as streak
    from public.profiles p
    join auth.users u
      on u.id = p.id
     and u.email_confirmed_at is not null
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
$$;
