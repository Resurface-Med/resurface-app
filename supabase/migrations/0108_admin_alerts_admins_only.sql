-- Admin alerts stay with admins (2026-11-25). The switch is only shown to
-- admins and admin_alert_send (0107) only sends to admins' devices; this
-- also stops anyone else marking their device for alerts at all.

create or replace function public.tg_admin_alerts_admins_only()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.admin_alerts and not exists (select 1 from public.admins a where a.user_id = new.user_id) then
    new.admin_alerts := false;
  end if;
  return new;
end $$;
revoke all on function public.tg_admin_alerts_admins_only() from public, anon, authenticated;

drop trigger if exists admin_alerts_admins_only on public.push_subscriptions;
create trigger admin_alerts_admins_only
  before insert or update of admin_alerts on public.push_subscriptions
  for each row execute function public.tg_admin_alerts_admins_only();
