-- Reminder notifications (2026-10-17, experimental).
--
-- A device that turns reminders on (Profile) is stored here with its push
-- address, time zone and chosen time. Every 15 minutes push_reminders_tick()
-- finds the devices whose reminder time has just come round, counts each
-- person's questions due, and posts the list to the backend
-- (/api/push/run), which signs and delivers. Nobody with nothing due is
-- sent anything; nobody gets two in a day.
--
-- The backend is called with a secret kept in the vault ('push_secret'),
-- the same value as PUSH_SECRET on Vercel. It is set outside this file.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  tz text not null default 'Europe/London',
  remind_at time not null default '18:00',
  enabled boolean not null default true,
  last_sent_on date,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions, read" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own push subscriptions, add" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "own push subscriptions, change" on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push subscriptions, remove" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create or replace function public.push_reminders_tick()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare items jsonb; picked bigint[]; secret text;
begin
  with ready as (
    select s.id, s.user_id, s.endpoint, s.p256dh, s.auth, s.remind_at, s.last_sent_on,
           (now() at time zone s.tz) as local_ts
      from public.push_subscriptions s
     where s.enabled
  ), at_time as (
    select r.*, (select count(*) from public.sr_cards c where c.user_id = r.user_id and c.due_date <= now()) as due
      from ready r
     where r.local_ts::time >= r.remind_at
       and r.local_ts::time < r.remind_at + interval '15 minutes'
       and coalesce(r.last_sent_on, date '2000-01-01') < r.local_ts::date
  )
  select jsonb_agg(jsonb_build_object(
           'subscription', jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)),
           'title', 'Resurface',
           'body', format('You have %s question%s due. It takes about %s minute%s.',
                          due, case when due = 1 then '' else 's' end,
                          greatest(1, ceil(due * 20 / 60.0)::int),
                          case when greatest(1, ceil(due * 20 / 60.0)::int) = 1 then '' else 's' end),
           'badge', due)),
         array_agg(id)
    into items, picked
    from at_time where due > 0;

  if items is null then return 0; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then return 0; end if;

  perform net.http_post(
    url := 'https://api.tryresurface.com/api/push/run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := jsonb_build_object('items', items),
    timeout_milliseconds := 20000
  );
  update public.push_subscriptions s
     set last_sent_on = (now() at time zone s.tz)::date
   where s.id = any (picked);
  return coalesce(array_length(picked, 1), 0);
end; $$;
revoke all on function public.push_reminders_tick() from public, anon, authenticated;

select cron.schedule('push-reminders', '*/15 * * * *', $$select public.push_reminders_tick()$$);
