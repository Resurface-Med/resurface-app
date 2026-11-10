-- admin_people: when each person last answered, to the minute (Rafil,
-- 2026-11-10). activity only keeps days, so Admin could say "Today" but not
-- when; answer_log stamps every answer. The return type changes, so the
-- function is dropped and recreated with the same grants.
create index if not exists answer_log_user_at on public.answer_log (user_id, at);

drop function if exists public.admin_people();
create function public.admin_people()
returns table(user_id uuid, display_name text, email text, joined timestamptz, last_active date, answered bigint, generated bigint, is_admin boolean, marketing boolean, study_year smallint, active_days bigint, last_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  with act as (select a.user_id, max(a.day) last_day, count(*) filter (where a.count > 0) days from public.activity a group by a.user_id),
  ps as (select s.user_id, sum(s.total) total from public.practice_stats s group by s.user_id),
  gq as (select g.user_id, count(*) n from public.generated_questions g group by g.user_id),
  la as (select l.user_id, max(l.at) last_at from public.answer_log l group by l.user_id)
  select u.id, p.display_name, u.email::text, u.created_at,
         act.last_day, coalesce(ps.total, 0)::bigint, coalesce(gq.n, 0),
         ad.user_id is not null, coalesce(p.marketing_opt_in, false), p.study_year, coalesce(act.days, 0),
         la.last_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join act on act.user_id = u.id
  left join ps on ps.user_id = u.id
  left join gq on gq.user_id = u.id
  left join la on la.user_id = u.id
  left join public.admins ad on ad.user_id = u.id
  where public.is_admin() and u.email_confirmed_at is not null
  order by u.created_at desc
$$;
revoke all on function public.admin_people() from public, anon;
grant execute on function public.admin_people() to authenticated, service_role;
