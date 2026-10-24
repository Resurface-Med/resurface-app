-- A sign-up counts once its email is confirmed (Rafil, 2026-10-24).
-- Email sign-ups that never enter the 6-digit code were counted as
-- accounts; they are noise. Counted on the day they confirm. Google
-- sign-ups are confirmed at once. The People list leaves them out too.

create or replace function public.admin_overview()
returns table(sort integer, key text, today bigint, last7 bigint, prev7 bigint, total bigint)
language sql stable security definer set search_path to 'public' as $$
  select 1, 'accounts',
    (select count(*) from auth.users where email_confirmed_at::date = current_date),
    (select count(*) from auth.users where email_confirmed_at >= now() - interval '7 days'),
    (select count(*) from auth.users where email_confirmed_at >= now() - interval '14 days'
        and email_confirmed_at < now() - interval '7 days'),
    (select count(*) from auth.users where email_confirmed_at is not null)
  where public.is_admin()
  union all
  select 2, 'active',
    (select count(distinct user_id) from public.activity where day = current_date),
    (select count(distinct user_id) from public.activity where day > current_date - 7),
    (select count(distinct user_id) from public.activity
        where day > current_date - 14 and day <= current_date - 7),
    (select count(distinct user_id) from public.activity)
  where public.is_admin()
  union all
  select 3, 'answers',
    (select coalesce(sum(count), 0) from public.activity where day = current_date),
    (select coalesce(sum(count), 0) from public.activity where day > current_date - 7),
    (select coalesce(sum(count), 0) from public.activity
        where day > current_date - 14 and day <= current_date - 7),
    (select coalesce(sum(count), 0) from public.activity)
  where public.is_admin()
  union all
  select 4, 'generated',
    (select count(*) from public.generated_questions where created_at::date = current_date),
    (select count(*) from public.generated_questions where created_at >= now() - interval '7 days'),
    (select count(*) from public.generated_questions where created_at >= now() - interval '14 days'
        and created_at < now() - interval '7 days'),
    (select count(*) from public.generated_questions)
  where public.is_admin()
  union all
  select 5, 'flags',
    (select count(*) from public.question_flags where created_at::date = current_date),
    (select count(*) from public.question_flags where created_at >= now() - interval '7 days'),
    (select count(*) from public.question_flags where created_at >= now() - interval '14 days'
        and created_at < now() - interval '7 days'),
    (select count(*) from public.question_flags)
  where public.is_admin()
  union all
  select 6, 'decks',
    (select count(*) from public.decks where created_at::date = current_date),
    (select count(*) from public.decks where created_at >= now() - interval '7 days'),
    (select count(*) from public.decks where created_at >= now() - interval '14 days'
        and created_at < now() - interval '7 days'),
    (select count(*) from public.decks)
  where public.is_admin()
  order by 1
$$;

create or replace function public.admin_overview_daily(days integer default 30)
returns table(day date, key text, value bigint)
language sql stable security definer set search_path to 'public' as $$
  with d as (
    select generate_series(current_date - (days - 1), current_date, interval '1 day')::date as day
  )
  select d.day, 'accounts',
         (select count(*) from auth.users u where u.email_confirmed_at::date = d.day) from d where public.is_admin()
  union all
  select d.day, 'active',
         (select count(distinct a.user_id) from public.activity a where a.day = d.day) from d where public.is_admin()
  union all
  select d.day, 'answers',
         (select coalesce(sum(a.count), 0) from public.activity a where a.day = d.day) from d where public.is_admin()
  union all
  select d.day, 'generated',
         (select count(*) from public.generated_questions g where g.created_at::date = d.day) from d where public.is_admin()
  union all
  select d.day, 'flags',
         (select count(*) from public.question_flags f where f.created_at::date = d.day) from d where public.is_admin()
  union all
  select d.day, 'decks',
         (select count(*) from public.decks k where k.created_at::date = d.day) from d where public.is_admin()
  order by 1
$$;

create or replace function public.admin_people()
returns table(user_id uuid, display_name text, email text, joined timestamp with time zone, last_active date, answered bigint, generated bigint, is_admin boolean, marketing boolean)
language sql stable security definer set search_path to 'public' as $$
  select u.id,
         p.display_name,
         u.email::text,
         u.created_at,
         (select max(a.day) from public.activity a where a.user_id = u.id),
         (select coalesce(sum(s.total), 0) from public.practice_stats s where s.user_id = u.id),
         (select count(*) from public.generated_questions g where g.user_id = u.id),
         exists (select 1 from public.admins ad where ad.user_id = u.id),
         coalesce(p.marketing_opt_in, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_admin() and u.email_confirmed_at is not null
  order by u.created_at desc
$$;
