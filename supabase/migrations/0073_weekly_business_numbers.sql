-- Weekly team email, second version (2026-11-07). Rafil: the first one was
-- about students' scores, which is their revision, not the business. This
-- one is growth, whether sign-ups start, whether people come back and how
-- often, installs, reminders, sharing and capacity. The backend has Gemini
-- write a short note from it. Our own accounts (public.admins) are left out.
-- Replaces weekly_summary_data from 0072.

create or replace function public.weekly_business_data(week_end date default (now() at time zone 'Europe/London')::date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s date := week_end - 7;
  p date := week_end - 14;
  ts timestamptz := (s::timestamp at time zone 'Europe/London');
  te timestamptz := (week_end::timestamp at time zone 'Europe/London');
  tp timestamptz := (p::timestamp at time zone 'Europe/London');
  out jsonb;
begin
  with
  staff as (select user_id from admins),
  act as (select a.user_id, a.day, a.count from activity a where a.user_id not in (select user_id from staff)),
  now_u as (select user_id, count(distinct day) days, sum(count) n from act where day >= s and day < week_end group by user_id),
  prev_u as (select user_id, count(distinct day) days from act where day >= p and day < s group by user_id),
  ever_before as (select distinct user_id from act where day < p),
  new_now as (select u.id, pr.study_year from auth.users u left join profiles pr on pr.id = u.id where u.created_at >= ts and u.created_at < te and u.id not in (select user_id from staff)),
  new_prev as (select u.id from auth.users u where u.created_at >= tp and u.created_at < ts and u.id not in (select user_id from staff)),
  daily as (select day, count(distinct user_id) dau from act where day >= s and day < week_end group by day),
  weeks as (
    select w, (select count(distinct user_id) from act where day >= week_end - 7*w and day < week_end - 7*(w-1)) wau
      from generate_series(1, 8) w
  ),
  feat as (
    with recursive r as (
      select deck_id as id from featured_decks
      union all select d.id from decks d join r on d.parent_id = r.id
    ) select distinct id from r
  ),
  ans as (
    select (g.deck_id in (select id from feat)) as ready_made
      from answer_log a
      left join generated_questions g on a.question_id >= 1000000 and g.id = a.question_id - 1000000
     where a.at >= ts and a.at < te and a.user_id not in (select user_id from staff)
  ),
  installs as (select distinct user_id, standalone, phone from load_timings where created_at >= ts and created_at < te and user_id not in (select user_id from staff))
  select jsonb_build_object(
    'week', jsonb_build_object('from', s, 'to', week_end - 1),
    'accounts_total', (select count(*) from auth.users where id not in (select user_id from staff)),
    'signups', (select count(*) from new_now),
    'signups_prev', (select count(*) from new_prev),
    'signups_by_year', (select coalesce(jsonb_object_agg(coalesce(study_year::text, 'not set'), n), '{}') from (select study_year, count(*) n from new_now group by study_year) x),
    'signups_studied', (select count(*) from new_now n where exists (select 1 from act a where a.user_id = n.id)),
    'signups_studied_2plus_days', (select count(*) from new_now n where (select count(distinct day) from act a where a.user_id = n.id) >= 2),
    'last_weeks_signups_back_this_week', (select count(*) from new_prev n where exists (select 1 from now_u u where u.user_id = n.id)),
    'weekly_active', (select count(*) from now_u),
    'weekly_active_prev', (select count(*) from prev_u),
    'weekly_active_last_8_weeks_oldest_first', (select jsonb_agg(wau order by w desc) from weeks),
    'avg_daily_active', (select round(avg(dau), 1) from daily),
    'stickiness_dau_over_wau_pct', (select round(100.0 * avg(dau) / nullif((select count(*) from now_u), 0)) from daily),
    'avg_days_active_per_student', (select round(avg(days), 1) from now_u),
    'students_4plus_days', (select count(*) from now_u where days >= 4),
    'students_1_day_only', (select count(*) from now_u where days = 1),
    'median_answers_per_student', (select percentile_cont(0.5) within group (order by n) from now_u),
    'retained_from_last_week', (select count(*) from prev_u pu where exists (select 1 from now_u nu where nu.user_id = pu.user_id)),
    'lapsed_active_last_week_not_this', (select count(*) from prev_u pu where not exists (select 1 from now_u nu where nu.user_id = pu.user_id)),
    'came_back_after_a_gap', (select count(*) from now_u nu where not exists (select 1 from prev_u pu where pu.user_id = nu.user_id) and nu.user_id in (select user_id from ever_before)),
    'active_by_year', (select coalesce(jsonb_object_agg(coalesce(y::text, 'not set'), n), '{}') from (select pr.study_year y, count(*) n from now_u u left join profiles pr on pr.id = u.user_id group by pr.study_year) x),
    'accounts_by_year', (select coalesce(jsonb_object_agg(coalesce(y::text, 'not set'), n), '{}') from (select study_year y, count(*) n from profiles where id not in (select user_id from staff) group by study_year) x),
    'share_of_answers_from_ready_made_decks_pct', (select round(100.0 * avg(case when ready_made then 1 else 0 end)) from ans),
    'decks_shared', (select count(*) from share_events where kind = 'copied' and at >= ts and at < te),
    'invites_shared', (select count(*) from onboarding_steps where step = 'invite_shared' and at >= ts and at < te),
    'students_who_made_own_questions', (select count(distinct user_id) from generated_questions where created_at >= ts and created_at < te and user_id not in (select user_id from staff)),
    'study_reminders_on', (select count(distinct user_id) from push_subscriptions where enabled),
    'students_using_installed_app', (select count(distinct user_id) from installs where standalone),
    'students_on_phone', (select count(distinct user_id) from installs where phone),
    'ai_generations_peak_day', (select coalesce(max(n), 0) from (select date_trunc('day', created_at), count(*) n from ai_usage where kind = 'generate' and created_at >= ts and created_at < te group by 1) x),
    'ai_daily_free_limit', 500,
    'question_reports_new', (select count(*) from question_flags where created_at >= ts and created_at < te),
    'database_keepalive_hours_ago', (select round(extract(epoch from now() - last_ok) / 3600) from ops_heartbeat where name = 'keepalive')
  ) into out;
  return out;
end $$;
revoke all on function public.weekly_business_data(date) from public, anon, authenticated;

create or replace function public.weekly_summary_tick() returns text
language plpgsql security definer set search_path = public as $$
declare secret text; recipients jsonb;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then return 'no secret'; end if;
  select jsonb_agg(u.email) into recipients from admins a join auth.users u on u.id = a.user_id where u.email is not null;
  perform net.http_post(
    url := 'https://api.tryresurface.com/api/weekly/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := jsonb_build_object('to', recipients, 'data', public.weekly_business_data()),
    timeout_milliseconds := 60000
  );
  insert into ops_heartbeat (name, last_ok, detail) values ('weekly_summary', now(), jsonb_build_object('to', recipients))
    on conflict (name) do update set last_ok = excluded.last_ok, detail = excluded.detail;
  return 'posted';
end $$;
revoke all on function public.weekly_summary_tick() from public, anon, authenticated;

drop function if exists public.weekly_summary_data(date);
