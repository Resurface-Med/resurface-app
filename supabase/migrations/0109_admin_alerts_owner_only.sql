-- Admin alerts are Rafil's alone (2026-11-25): the switch shows only for
-- is_owner(), only his devices can be marked for alerts, and only his are
-- sent to. Same uid as is_owner().

create or replace function public.tg_admin_alerts_admins_only()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.admin_alerts and new.user_id is distinct from '0b920395-b28e-442e-a68b-28e0b7d0a06b'::uuid then
    new.admin_alerts := false;
  end if;
  return new;
end $$;

create or replace function public.admin_alert_send(title text, body text, url text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare items jsonb; secret text;
begin
  select jsonb_agg(jsonb_build_object(
           'subscription', jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)),
           'title', title, 'body', body, 'url', url))
    into items
    from public.push_subscriptions s
   where s.admin_alerts and s.user_id = '0b920395-b28e-442e-a68b-28e0b7d0a06b'::uuid;
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

update public.push_subscriptions set admin_alerts = false
 where admin_alerts and user_id <> '0b920395-b28e-442e-a68b-28e0b7d0a06b'::uuid;
