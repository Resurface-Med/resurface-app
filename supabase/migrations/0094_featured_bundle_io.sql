-- Cut featured-bundle Disk IO without losing the cache (2026-11-22).
--
-- Cron was every 15s (0090) so admin/connector edits went live quickly after
-- featured_bundle_publish started timing out (~9s build vs 8s authenticated
-- statement_timeout). That is fine when nothing changed — refresh compares
-- versions and returns — but a featured-tree storm (bulk delete/insert) bumps
-- featured_meta on every row, so each quiet gap between bumps still triggers
-- a full ~9MB rebuild and spills gigabytes of temp blocks.
--
-- Fix:
--   1. Coalesce: cron only rebuilds after featured_meta has been quiet for
--      45s, so a storm collapses into one build at the final version.
--   2. Admin publish forces an immediate rebuild and raises statement_timeout
--      for that transaction so the app path can finish again.
--   3. Cron back to once a minute (safety net for connector edits that never
--      call publish). Cheap no-ops when versions match; coalesced when not.

drop function if exists public.featured_bundle_refresh();

create or replace function public.featured_bundle_refresh(force boolean default false)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v bigint;
  s bigint;
  changed timestamptz;
begin
  select version into s from featured_bundle_store where id = 1;
  if not pg_try_advisory_xact_lock(hashtext('featured_bundle_refresh')) then
    return s;
  end if;
  select version, changed_at into v, changed from featured_meta where id = 1;
  if s is not distinct from v then
    return s;
  end if;
  -- Empty store must build; otherwise wait out rapid bumps unless forced.
  if s is not null
     and not force
     and changed is not null
     and changed > now() - interval '45 seconds' then
    return s;
  end if;
  insert into featured_bundle_store (id, version, body, built_at)
    values (1, v, jsonb_set(featured_bundle_build(), '{version}', to_jsonb(v)), now())
    on conflict (id) do update
      set version = excluded.version,
          body = excluded.body,
          built_at = excluded.built_at;
  return v;
end;
$$;

create or replace function public.featured_bundle_publish()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  -- Build can exceed the authenticated 8s cap; this runs as definer and the
  -- LOCAL timeout covers the forced refresh in this transaction.
  perform set_config('statement_timeout', '120s', true);
  return public.featured_bundle_refresh(true);
end;
$$;

revoke all on function public.featured_bundle_refresh(boolean) from public, anon, authenticated;
revoke all on function public.featured_bundle_publish() from public, anon;
grant execute on function public.featured_bundle_publish() to authenticated;

select cron.unschedule('featured-bundle')
 where exists (select 1 from cron.job where jobname = 'featured-bundle');
select cron.schedule('featured-bundle', '* * * * *', 'select public.featured_bundle_refresh()');
