-- admin_people, each table read once (2026-11-10). It ran five correlated
-- subqueries per account; with 100+ accounts and 13,000 questions the first
-- call after idle took ~1 s. Grouped CTEs joined once: ~10 ms, and the
-- question count is an index-only scan on generated_questions_user.
create or replace function public.admin_people()
returns table(user_id uuid, display_name text, email text, joined timestamptz, last_active date, answered bigint, generated bigint, is_admin boolean, marketing boolean, study_year smallint, active_days bigint)
language sql stable security definer set search_path to 'public' as $$
  with act as (select a.user_id, max(a.day) last_day, count(*) filter (where a.count > 0) days from public.activity a group by a.user_id),
  ps as (select s.user_id, sum(s.total) total from public.practice_stats s group by s.user_id),
  gq as (select g.user_id, count(*) n from public.generated_questions g group by g.user_id)
  select u.id, p.display_name, u.email::text, u.created_at,
         act.last_day, coalesce(ps.total, 0)::bigint, coalesce(gq.n, 0),
         ad.user_id is not null, coalesce(p.marketing_opt_in, false), p.study_year, coalesce(act.days, 0)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join act on act.user_id = u.id
  left join ps on ps.user_id = u.id
  left join gq on gq.user_id = u.id
  left join public.admins ad on ad.user_id = u.id
  where public.is_admin() and u.email_confirmed_at is not null
  order by u.created_at desc
$$;
