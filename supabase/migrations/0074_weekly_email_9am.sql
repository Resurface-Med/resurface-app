-- Weekly team email moves to 9am UK time (Rafil, 2026-11-07:
-- 7am was too early; briefly Fridays, then back to Mondays). pg_cron runs in UTC, so it fires at 08:00 and
-- 09:00 UTC and the tick only sends from the one that is 9am in London,
-- which keeps it at 9am through the clock changes. It covers the seven days
-- Monday to Sunday.

create or replace function public.weekly_summary_tick() returns text
language plpgsql security definer set search_path = public as $$
declare secret text; recipients jsonb;
begin
  if extract(hour from now() at time zone 'Europe/London') <> 9 then return 'not 9am in London'; end if;
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

select cron.unschedule('weekly-summary') where exists (select 1 from cron.job where jobname = 'weekly-summary');
select cron.schedule('weekly-summary', '0 8,9 * * 1', 'select public.weekly_summary_tick()');
