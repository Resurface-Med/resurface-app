-- Weekly team summary (2026-11-07). Every Monday morning the database works
-- out how the last seven days went and posts it to the backend, which turns
-- it into an email to everyone in public.admins (Rafil, Jacob, Rayan) via
-- Resend. Same shape as the study reminders: the numbers never leave the
-- database except in that one signed post, guarded by the push_secret already
-- in the vault, so the backend needs no database key of its own.
--
-- Weeks run Monday to Sunday (London dates). Active users and answers come
-- from public.activity, which is kept for good; the deck breakdown comes
-- from answer_log, which only needs the latest week.

create or replace function public.weekly_summary_data(week_end date default (now() at time zone 'Europe/London')::date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s date := week_end - 7;           -- first day of the week being reported
  p date := week_end - 14;          -- first day of the week before
  ts timestamptz := (s::timestamp at time zone 'Europe/London');
  te timestamptz := (week_end::timestamp at time zone 'Europe/London');
  tp timestamptz := (p::timestamp at time zone 'Europe/London');
  out jsonb;
begin
  with
  act_now as (select user_id, sum(count) n from activity where day >= s and day < week_end group by user_id),
  act_prev as (select user_id, sum(count) n from activity where day >= p and day < s group by user_id),
  new_users as (select id from auth.users where created_at >= ts and created_at < te),
  -- each deck inside a ready-made deck, with that ready-made deck. Answers
  -- anywhere else are grouped as students' own decks and never named: their
  -- deck names are private and sometimes carry their own names.
  feat as (
    with recursive r as (
      select deck_id as id, deck_id as fid from featured_decks
      union all select d.id, r.fid from decks d join r on d.parent_id = r.id
    ) select distinct on (id) id, fid from r
  ),
  answers as (
    select a.user_id, a.correct, (f.fid is not null) as featured,
           case when a.question_id < 1000000 then 'Built-in bank'
                when f.fid is not null then fd.name
                else 'Students'' own decks' end as deck
      from answer_log a
      left join generated_questions g on a.question_id >= 1000000 and g.id = a.question_id - 1000000
      left join feat f on f.id = g.deck_id
      left join decks fd on fd.id = f.fid
     where a.at >= ts and a.at < te
  ),
  by_deck as (
    select deck, featured, count(*) n, count(distinct user_id) people,
           round(100.0 * avg(case when correct then 1 else 0 end)) accuracy
      from answers group by deck, featured order by count(*) desc limit 8
  )
  select jsonb_build_object(
    'from', s, 'to', week_end - 1,
    'signups', (select count(*) from new_users),
    'signups_prev', (select count(*) from auth.users where created_at >= tp and created_at < ts),
    'signups_answered', (select count(*) from new_users u where exists (select 1 from activity a where a.user_id = u.id)),
    'active', (select count(*) from act_now),
    'active_prev', (select count(*) from act_prev),
    'answers', (select coalesce(sum(n), 0) from act_now),
    'answers_prev', (select coalesce(sum(n), 0) from act_prev),
    'returned', (select count(*) from act_prev ap where exists (select 1 from act_now an where an.user_id = ap.user_id)),
    'accuracy', (select round(100.0 * avg(case when correct then 1 else 0 end)) from answers),
    'busiest_day', (select jsonb_build_object('day', to_char(day, 'FMDay'), 'answers', sum(count))
                      from activity where day >= s and day < week_end group by day order by sum(count) desc limit 1),
    'top_users_answers', (select coalesce(jsonb_agg(n order by n desc), '[]') from (select n from act_now order by n desc limit 5) x),
    'decks', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from by_deck b),
    'reports', (select count(*) from question_flags where created_at >= ts and created_at < te),
    'reports_open', (select count(*) from question_flags),
    'shares', (select count(*) from share_events where at >= ts and at < te),
    'ai_calls', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from ai_usage where created_at >= ts and created_at < te group by kind) x),
    'reminders_on', (select count(distinct user_id) from push_subscriptions where enabled),
    'longest_streak', (select coalesce(max(current), 0) from streaks where last_date >= week_end - 2),
    'users_total', (select count(*) from auth.users),
    'keepalive_age_hours', (select round(extract(epoch from now() - last_ok) / 3600) from ops_heartbeat where name = 'keepalive')
  ) into out;
  return out;
end $$;

revoke all on function public.weekly_summary_data(date) from public, anon, authenticated;

-- Posts the summary to the backend. Recipients are the admins, read fresh
-- each week so a changed email or a new admin is picked up without a deploy.
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
    body := jsonb_build_object('to', recipients, 'data', public.weekly_summary_data()),
    timeout_milliseconds := 30000
  );
  insert into ops_heartbeat (name, last_ok, detail) values ('weekly_summary', now(), jsonb_build_object('to', recipients))
    on conflict (name) do update set last_ok = excluded.last_ok, detail = excluded.detail;
  return 'posted';
end $$;

revoke all on function public.weekly_summary_tick() from public, anon, authenticated;

-- Mondays 07:00 UTC: 7am in winter, 8am in summer, UK time.
select cron.unschedule('weekly-summary') where exists (select 1 from cron.job where jobname = 'weekly-summary');
select cron.schedule('weekly-summary', '0 7 * * 1', 'select public.weekly_summary_tick()');
