-- Admin from a snapshot (2026-11-24).
--
-- admin_dashboard (0100) took 80 ms with the tables in memory, but 1–8 s
-- when they were not: phones downloading ready-made decks push the admin
-- tables out of the free plan's small cache, so the first open of Admin each
-- time was the slow one. Now a cron job builds the whole dashboard once a
-- minute into one row, and admin_dashboard hands that row back (a few ms
-- whatever else the database is doing). Reported questions are still read
-- live, so a report that has just been dealt with leaves the list at once.
--
-- Building it every minute costs about 80 ms of database time, and keeps
-- the admin tables warm as a side effect.

create table if not exists public.admin_dashboard_snapshot (
  id smallint primary key default 1 check (id = 1),
  cal integer not null,
  body jsonb not null,
  built_at timestamptz not null default now()
);
alter table public.admin_dashboard_snapshot enable row level security;
revoke all on public.admin_dashboard_snapshot from anon, authenticated;

/* Everything but the reports. The admin_* functions each check is_admin(),
   which reads auth.uid(), so the build runs as an admin for the length of
   its own transaction. Only the cron job may call it. */
create or replace function public.admin_dashboard_build(cal integer default 182)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare uid uuid;
begin
  select user_id into uid from public.admins order by user_id limit 1;
  if uid is null then return null; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  return jsonb_build_object(
    'overview',          (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_overview() x),
    'overviewDaily:30',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_overview_daily(30) x),
    'aiQuota',           (select to_jsonb(x) from public.admin_ai_quota() x limit 1),
    'storage',           public.admin_storage(),
    'people',            (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people() x),
    'peopleDaily:30',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people_daily(30) x),
    'peopleDaily:cal',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people_daily(cal) x),
    'generatedDaily:cal',(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_generated_daily(cal) x)
  );
end $$;
revoke execute on function public.admin_dashboard_build(integer) from public, anon, authenticated;

create or replace function public.admin_dashboard_refresh()
returns void language plpgsql volatile security definer set search_path to 'public' as $$
declare b jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('admin_dashboard_refresh')) then return; end if;
  b := public.admin_dashboard_build(182);
  if b is null then return; end if;
  insert into public.admin_dashboard_snapshot (id, cal, body, built_at) values (1, 182, b, now())
    on conflict (id) do update set cal = excluded.cal, body = excluded.body, built_at = excluded.built_at;
end $$;
revoke execute on function public.admin_dashboard_refresh() from public, anon, authenticated;

/* The snapshot when it is fresh and for the span asked for; otherwise built
   live, as before. Reports are always live. */
create or replace function public.admin_dashboard(cal integer default 182)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare snap jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select s.body into snap from public.admin_dashboard_snapshot s
   where s.id = 1 and s.cal = admin_dashboard.cal and s.built_at > now() - interval '3 minutes';
  if snap is null then
    snap := jsonb_build_object(
      'overview',          (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_overview() x),
      'overviewDaily:30',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_overview_daily(30) x),
      'aiQuota',           (select to_jsonb(x) from public.admin_ai_quota() x limit 1),
      'storage',           public.admin_storage(),
      'people',            (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people() x),
      'peopleDaily:30',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people_daily(30) x),
      'peopleDaily:cal',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people_daily(admin_dashboard.cal) x),
      'generatedDaily:cal',(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_generated_daily(admin_dashboard.cal) x)
    );
  end if;
  return snap || jsonb_build_object(
    'flags', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_flags() x),
    'builtAt', (select s.built_at from public.admin_dashboard_snapshot s where s.id = 1)
  );
end $$;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'admin-dashboard';
select cron.schedule('admin-dashboard', '* * * * *', 'select public.admin_dashboard_refresh()');
select public.admin_dashboard_refresh();
