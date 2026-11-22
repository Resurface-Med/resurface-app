-- The ready-made bundle in pieces, fetched only when they change (2026-11-22).
--
-- The bundle is 14 MB of JSON, and any edit to any ready-made deck made
-- every phone download all of it again. Since 0095 it is built from one
-- shard per listed root (featured_bundle_shard), each rebuilt only when its
-- root changes. Each shard now carries a hash of its body; featured_mine
-- lists the shards with their hashes; the app keeps each shard on the
-- device and fetches only those whose hash it does not have, then puts the
-- bundle together itself (lib/featuredParts). An edit to one Year 1
-- question costs that root's shard (0.2–2 MB), not the whole bundle.
--
-- featured_bundle and featured_bundle_store are left as they are, for
-- copies of the app from before this.

alter table public.featured_bundle_shard
  add column if not exists hash text generated always as (md5(body::text)) stored;

/* The listed shards in the order featured_bundle_compose puts them. */
create or replace function public.featured_parts()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('root', f.deck_id, 'hash', s.hash) order by f.position, f.deck_id), '[]'::jsonb)
    from featured_decks f join featured_bundle_shard s on s.root_id = f.deck_id
   where f.listed
$$;

/* One shard, with its hash. Listed roots only; the same content
   featured_bundle already gives anyone. */
create or replace function public.featured_shard(root uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('root', s.root_id, 'hash', s.hash, 'body', s.body)
    from featured_bundle_shard s join featured_decks f on f.deck_id = s.root_id and f.listed
   where s.root_id = $1
$$;
alter function public.featured_shard(uuid) set statement_timeout = '25s';

grant execute on function public.featured_parts() to anon, authenticated;
grant execute on function public.featured_shard(uuid) to anon, authenticated;

create or replace function public.featured_mine()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'version', public.featured_version(),
    'parts', public.featured_parts(),
    'roots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.deck_id,
        'mine', d.owner_id = auth.uid(),
        'hidden', exists (select 1 from featured_hidden h where h.user_id = auth.uid() and h.deck_id = f.deck_id),
        'copyId', (select c.id from decks c where c.owner_id = auth.uid() and c.source_deck_id = f.deck_id order by c.created_at desc limit 1)
      ))
      from featured_decks f join decks d on d.id = f.deck_id
      where auth.uid() is not null and f.listed and (d.owner_id <> auth.uid() or f.owner_sees)), '[]'::jsonb),
    'extra', public.featured_extra()
  );
$$;
