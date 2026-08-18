-- Leaderboard: default-on visibility + weekly ranking RPC.
-- Display name prefers signup metadata `display_name`.

alter table public.profiles
  add column if not exists show_on_leaderboard boolean not null default true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, show_on_leaderboard)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    true
  );
  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;

-- Ranks everyone who opted in (default) and has a non-empty display name.
-- Metric is questions answered in the last 7 local calendar days, then streak.
create or replace function public.leaderboard_week()
returns table (
  user_id uuid,
  display_name text,
  week_count integer,
  streak integer,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      p.id as user_id,
      trim(p.display_name) as display_name,
      coalesce(sum(a.count), 0)::integer as week_count,
      coalesce(s.current, 0)::integer as streak
    from public.profiles p
    left join public.activity a
      on a.user_id = p.id
     and a.day >= (current_date - 6)
    left join public.streaks s
      on s.user_id = p.id
    where p.show_on_leaderboard = true
      and p.display_name is not null
      and length(trim(p.display_name)) > 0
    group by p.id, p.display_name, s.current
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

grant execute on function public.leaderboard_week() to authenticated;
