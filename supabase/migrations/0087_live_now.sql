-- Who is doing questions right now, read from the answers themselves
-- (2026-11-17). The live strip used Realtime presence, which only shows
-- someone whose own app reports them: an app left open from before an update,
-- or one whose connection dropped and never rejoined, answered all evening
-- and never appeared. Every version of the app saves its answers, so the list
-- comes from there.
--
-- received_at is the server's clock: `at` is the phone's, and a phone set a
-- few minutes wrong would never count as live. Added without a table rewrite;
-- older rows stay null and are never live anyway.
alter table public.answer_log add column if not exists received_at timestamptz;
alter table public.answer_log alter column received_at set default now();
create index if not exists answer_log_received_at on public.answer_log (received_at)
  where received_at is not null;

-- Live: an answer in the last ten minutes. The count is this sitting's:
-- answers since the last gap of more than ten minutes. Anyone hidden from the
-- leaderboard is never listed; the caller is left out.
create or replace function public.live_now()
returns table (user_id uuid, display_name text, avatar text, study_year integer, answered integer)
language sql stable security definer set search_path = public as $$
  with recent as (
    select a.user_id, a.received_at as at
    from public.answer_log a
    where a.received_at > now() - interval '6 hours'
      and a.user_id <> auth.uid()
  ),
  live as (
    select r.user_id from recent r group by r.user_id
    having max(r.at) > now() - interval '10 minutes'
  ),
  marked as (
    select r.user_id, r.at,
           sum(case when r.at - lag_at > interval '10 minutes' then 1 else 0 end)
             over (partition by r.user_id order by r.at) as sitting
    from (select r.*, lag(r.at) over (partition by r.user_id order by r.at) as lag_at
          from recent r join live l using (user_id)) r
  ),
  counted as (
    select m.user_id, count(*)::integer as answered
    from marked m
    where m.sitting = (select max(m2.sitting) from marked m2 where m2.user_id = m.user_id)
    group by m.user_id
  )
  select c.user_id, trim(p.display_name), public.avatar_of(p.avatar_v, u.raw_user_meta_data),
         p.study_year, c.answered
  from counted c
  join public.profiles p on p.id = c.user_id
  join auth.users u on u.id = c.user_id
  where p.show_on_leaderboard = true
    and length(trim(coalesce(p.display_name, ''))) > 0
    and auth.uid() is not null
  order by c.answered desc
  limit 50;
$$;

revoke all on function public.live_now() from public, anon;
grant execute on function public.live_now() to authenticated;
