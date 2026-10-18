-- Requests to the AI per day, for Admin's headline (2026-10-18).
--
-- Rafil's main number: how many times the generator was called today. Days
-- are UK days. Separately, how much of the free tier's daily allowance is
-- spent: Gemini's limit (500 requests a day for the model, which generating
-- and Resurface AI share) resets at midnight Pacific time, which is 8am in
-- the UK, so that count runs from the last Pacific midnight, both kinds
-- together. Only requests that reached the model are recorded (ai_usage).

create or replace function public.admin_ai_calls_daily(days integer default 30)
returns table (day date, generate bigint, explain bigint)
language sql stable security definer set search_path to 'public' as $$
  with span as (
    select generate_series((now() at time zone 'Europe/London')::date - (days - 1),
                           (now() at time zone 'Europe/London')::date, interval '1 day')::date d
  )
  select s.d,
         count(u.*) filter (where u.kind = 'generate'),
         count(u.*) filter (where u.kind = 'explain')
  from span s
  left join public.ai_usage u on (u.created_at at time zone 'Europe/London')::date = s.d
  where public.is_admin()
  group by s.d
  order by s.d;
$$;

create or replace function public.admin_ai_quota()
returns table (used bigint, generate bigint, explain bigint, resets_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  with w as (
    select (date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') as since
  )
  select count(u.*), count(u.*) filter (where u.kind = 'generate'), count(u.*) filter (where u.kind = 'explain'),
         (select since + interval '1 day' from w)
  from w left join public.ai_usage u on u.created_at >= w.since
  where public.is_admin();
$$;

revoke all on function public.admin_ai_calls_daily(integer) from public, anon;
revoke all on function public.admin_ai_quota() from public, anon;
grant execute on function public.admin_ai_calls_daily(integer) to authenticated;
grant execute on function public.admin_ai_quota() to authenticated;
