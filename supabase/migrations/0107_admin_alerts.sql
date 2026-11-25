-- Admin alerts on the phone (2026-11-25).
--
-- A push to every admin device that has them on, when someone confirms a
-- sign-up and when a student reports a question. Sent the way the study
-- reminders are (0011): the database posts to the backend's /api/push/run,
-- which signs and delivers.
--
-- A device turns alerts on from Settings › Notifications, admins only. That
-- is a push_subscriptions row with admin_alerts on; enabled (the reminders)
-- stays off unless reminders were turned on too.
--
-- Neither trigger can stop the sign-up or the report: sending is
-- fire-and-forget (pg_net), and any error is swallowed.

alter table public.push_subscriptions
  add column if not exists admin_alerts boolean not null default false;

create or replace function public.admin_alert_send(title text, body text, url text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare items jsonb; secret text;
begin
  select jsonb_agg(jsonb_build_object(
           'subscription', jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)),
           'title', title, 'body', body, 'url', url))
    into items
    from public.push_subscriptions s
    join public.admins a on a.user_id = s.user_id
   where s.admin_alerts;
  if items is null then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://api.tryresurface.com/api/push/run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := jsonb_build_object('items', items),
    timeout_milliseconds := 20000
  );
exception when others then
  return;
end $$;
revoke all on function public.admin_alert_send(text, text, text) from public, anon, authenticated;

/* A sign-up counts once the email is confirmed (0051), whether that is at
   insert or later. */
create or replace function public.tg_admin_alert_signup()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    perform public.admin_alert_send('New sign-up', coalesce(new.email, 'Someone new'), '/?view=admin');
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.tg_admin_alert_signup() from public, anon, authenticated;

drop trigger if exists admin_alert_signup on auth.users;
create trigger admin_alert_signup
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.tg_admin_alert_signup();

/* A new report, or a question reported again after being resolved. Only
   the first open report on a question alerts; more on the same one wait in
   the Reported list. */
create or replace function public.tg_admin_alert_report()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare stem text;
begin
  if new.resolved_at is not null then return new; end if;
  if tg_op = 'UPDATE' and new.created_at is not distinct from old.created_at then return new; end if;
  if exists (select 1 from public.question_flags f
              where f.question_id = new.question_id and f.resolved_at is null and f.user_id <> new.user_id) then
    return new;
  end if;
  stem := coalesce(nullif(btrim(new.stem), ''), 'A question');
  if length(stem) > 90 then stem := left(stem, 88) || '…'; end if;
  perform public.admin_alert_send(
    'Question reported',
    case when nullif(btrim(new.note), '') is not null
         then '“' || stem || '” · ' || left(btrim(new.note), 100)
         else '“' || stem || '”' end,
    '/?view=admin&tab=flags');
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.tg_admin_alert_report() from public, anon, authenticated;

drop trigger if exists admin_alert_report on public.question_flags;
create trigger admin_alert_report
  after insert or update of created_at on public.question_flags
  for each row execute function public.tg_admin_alert_report();
