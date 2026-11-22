-- Admin in one request (2026-11-22).
--
-- Opening Admin fired nine requests at once (overview, its 30-day chart,
-- the AI quota, storage, people, two activity ranges, generated per day,
-- reports). Alone they take half a second between them; at once, on the
-- free plan's shared CPU and beside the app's own load, every one of them
-- took 1.2 to 1.8 s (pg_stat_statements, Rafil opening Admin this
-- morning). This runs them one after another in one call and returns what
-- each would have, under the keys AdminView keeps them by.

create or replace function public.admin_dashboard(cal integer default 182)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'overview',          (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_overview() x),
    'overviewDaily:30',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_overview_daily(30) x),
    'aiQuota',           (select to_jsonb(x) from public.admin_ai_quota() x limit 1),
    'storage',           public.admin_storage(),
    'people',            (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people() x),
    'peopleDaily:30',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people_daily(30) x),
    'peopleDaily:cal',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_people_daily(cal) x),
    'generatedDaily:cal',(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_generated_daily(cal) x),
    'flags',             (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.admin_flags() x)
  );
end $$;

revoke all on function public.admin_dashboard(integer) from public, anon;
grant execute on function public.admin_dashboard(integer) to authenticated;
