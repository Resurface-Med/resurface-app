-- "Questions generated" on Admin counts students' own questions only
-- (Rafil, 2026-11-10). It counted every row in generated_questions, so
-- questions an admin added to the ready-made decks (1,317 on 10 Nov) showed
-- up as a jump in students generating. Admins' rows are left out, as the
-- weekly email already does (weekly_business_data). admin_overview_daily
-- also reads each table once, grouped by day, instead of six subqueries per
-- day of the range.

create or replace function public.admin_overview()
returns table(sort integer, key text, today bigint, last7 bigint, prev7 bigint, total bigint)
language sql stable security definer set search_path to 'public' as $$
  with b as (select date_trunc('day', now()) d0, now() - interval '7 days' w1, now() - interval '14 days' w2),
  c as (
    select 1 s, 'accounts' k,
      count(*) filter (where email_confirmed_at >= b.d0),
      count(*) filter (where email_confirmed_at >= b.w1),
      count(*) filter (where email_confirmed_at >= b.w2 and email_confirmed_at < b.w1),
      count(*) filter (where email_confirmed_at is not null)
      from auth.users, b
    union all
    select 2, 'active',
      count(distinct user_id) filter (where day = current_date),
      count(distinct user_id) filter (where day > current_date - 7),
      count(distinct user_id) filter (where day > current_date - 14 and day <= current_date - 7),
      count(distinct user_id)
      from public.activity
    union all
    select 3, 'answers',
      coalesce(sum(count) filter (where day = current_date), 0),
      coalesce(sum(count) filter (where day > current_date - 7), 0),
      coalesce(sum(count) filter (where day > current_date - 14 and day <= current_date - 7), 0),
      coalesce(sum(count), 0)
      from public.activity
    union all
    select 4, 'generated',
      count(*) filter (where created_at >= b.d0),
      count(*) filter (where created_at >= b.w1),
      count(*) filter (where created_at >= b.w2 and created_at < b.w1),
      count(*)
      from public.generated_questions, b
      where user_id not in (select user_id from public.admins)
    union all
    select 5, 'flags',
      count(*) filter (where created_at >= b.d0),
      count(*) filter (where created_at >= b.w1),
      count(*) filter (where created_at >= b.w2 and created_at < b.w1),
      count(*)
      from public.question_flags, b
    union all
    select 6, 'decks',
      count(*) filter (where created_at >= b.d0),
      count(*) filter (where created_at >= b.w1),
      count(*) filter (where created_at >= b.w2 and created_at < b.w1),
      count(*)
      from public.decks, b
  )
  select * from c where public.is_admin() order by 1;
$$;

create or replace function public.admin_overview_daily(days integer default 30)
returns table(day date, key text, value bigint)
language sql stable security definer set search_path to 'public' as $$
  with d as (select generate_series(current_date - (days - 1), current_date, interval '1 day')::date as day),
  lo as (select min(day) from d),
  v as (
    select email_confirmed_at::date as day, 'accounts' as key, count(*) as n from auth.users
      where email_confirmed_at >= (select * from lo) group by 1
    union all
    select a.day, 'active', count(distinct a.user_id) from public.activity a where a.day >= (select * from lo) group by 1
    union all
    select a.day, 'answers', coalesce(sum(a.count), 0) from public.activity a where a.day >= (select * from lo) group by 1
    union all
    select g.created_at::date, 'generated', count(*) from public.generated_questions g
      where g.created_at >= (select * from lo) and g.user_id not in (select user_id from public.admins) group by 1
    union all
    select f.created_at::date, 'flags', count(*) from public.question_flags f where f.created_at >= (select * from lo) group by 1
    union all
    select k.created_at::date, 'decks', count(*) from public.decks k where k.created_at >= (select * from lo) group by 1
  )
  select d.day, k.key, coalesce(v.n, 0)
  from d cross join (values ('accounts'), ('active'), ('answers'), ('generated'), ('flags'), ('decks')) k(key)
  left join v on v.day = d.day and v.key = k.key
  where public.is_admin()
  order by 1;
$$;
