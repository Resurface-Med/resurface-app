-- Featured bundle: rebuild only dirty roots, then compose (2026-11-22).
--
-- The monolithic featured_bundle_build() rescanned every listed root (~9MB)
-- on any featured change. After Year 3 cascade deletes that meant many full
-- rebuilds and Disk IO budget burn. 0094 coalesced storms; this splits the
-- cache into one shard per featured root and rebuilds only marked roots.
-- featured_bundle() / edge still see one composed JSON with a global version.

create table if not exists public.featured_bundle_shard (
  root_id uuid primary key references public.decks(id) on delete cascade,
  body jsonb not null,
  built_at timestamptz not null default now()
);
alter table public.featured_bundle_shard enable row level security;

create table if not exists public.featured_bundle_dirty (
  root_id uuid primary key references public.decks(id) on delete cascade,
  marked_at timestamptz not null default now()
);
alter table public.featured_bundle_dirty enable row level security;

/* featured_root_of(deck) already exists (0048b) — reuse it. */

/* Replace the old zero-arg bump before adding the uuid form (avoids ambiguity). */
drop function if exists public.bump_featured_version();
drop function if exists public.bump_featured_version(uuid);

/* Mark one root dirty (or every listed root when p_root is null) and bump. */
create or replace function public.bump_featured_version(p_root uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_root is null then
    insert into featured_bundle_dirty (root_id, marked_at)
      select deck_id, now() from featured_decks where listed
      on conflict (root_id) do update set marked_at = excluded.marked_at;
  else
    insert into featured_bundle_dirty (root_id, marked_at)
      values (p_root, now())
      on conflict (root_id) do update set marked_at = excluded.marked_at;
  end if;
  update featured_meta set version = version + 1, changed_at = now() where id = 1;
end;
$$;

/* One listed root → shard body (root + decks + per-root topics + questions). */
create or replace function public.featured_bundle_build_root(p_root uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with recursive root as (
    select f.deck_id id, f.byline, f.position, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5('featured-folder:' || lower(trim(f.folder)))::uuid end top
      from featured_decks f
     where f.listed and f.deck_id = p_root
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.covers, d.position, d.id as root, d.owner_id
      from decks d join root r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.covers, c.position, t.root, c.owner_id
      from decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
  ),
  raw as (
    select g.id, g.deck_id, g.payload - 'topic' p, g.payload -> 'topic' topic, g.payload -> 'hl' hl
      from generated_questions g where g.deck_id in (select id from tree)
  ),
  q as (
    select id, deck_id, p,
           case when jsonb_typeof(hl) = 'array' and jsonb_array_length(hl) > 0
                 and topic ? 'body'
                 and not exists (select 1 from jsonb_array_elements_text(hl) h
                                  where position(h in replace(topic ->> 'body', '==', '')) = 0)
                then jsonb_set(topic, '{body}', to_jsonb(replace(topic ->> 'body', '==', '')))
                else topic end topic
      from raw
  ),
  topics as (
    select topic, (row_number() over (order by min(id)) - 1) idx
      from q where topic is not null group by topic
  )
  select jsonb_build_object(
    'root', (
      select jsonb_build_object(
        'id', r.id, 'top', r.top,
        'byline', coalesce(nullif(trim(r.byline), ''), nullif(trim(p.display_name), ''), 'Someone'),
        'position', r.position, 'shareCode', d.share_code
      )
      from root r join decks d on d.id = r.id left join profiles p on p.id = d.owner_id
    ),
    'decks', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', r.top, 'name', r.folder, 'position', 0, 'root', r.id, 'parentId', null) x
          from root r where r.folder is not null
        union all
        select jsonb_build_object(
          'id', t.id, 'name', coalesce(r.renames ->> t.id::text, t.name),
          'position', case when t.id = t.root then r.position else t.position end,
          'root', t.root,
          'parentId', case when t.id = t.root then (case when r.folder is null then null else r.top end) else t.parent_id end)
          || case when nullif(trim(t.covers), '') is null then '{}'::jsonb else jsonb_build_object('covers', trim(t.covers)) end
          from tree t join root r on r.id = t.root
      ) s), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(topic order by idx) from topics), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'deckId', q.deck_id, 'payload', q.p)
             || case when t.idx is null then '{}'::jsonb else jsonb_build_object('t', t.idx) end)
      from q left join topics t on t.topic = q.topic), '[]'::jsonb)
  );
$$;

/* Stitch shards into the public bundle shape (global topic indexes remapped).
   SQL, not a PL/pgSQL loop over every question — that timed out MCP tests. */
create or replace function public.featured_bundle_compose()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with ordered as (
    select f.position, f.deck_id, s.body,
           coalesce(
             sum(coalesce(jsonb_array_length(s.body->'topics'), 0))
               over (order by f.position, f.deck_id
                     rows between unbounded preceding and 1 preceding),
             0
           )::int as t_off
      from featured_decks f
      join featured_bundle_shard s on s.root_id = f.deck_id
     where f.listed
  ),
  roots as (
    select coalesce(jsonb_agg(o.body->'root' order by o.position, o.deck_id), '[]'::jsonb) as v
      from ordered o
     where o.body->'root' is not null and o.body->'root' <> 'null'::jsonb
  ),
  decks as (
    select coalesce(jsonb_agg(ord.elem order by o.position, o.deck_id, ord.ordinality), '[]'::jsonb) as v
      from ordered o
      cross join lateral jsonb_array_elements(coalesce(o.body->'decks','[]'::jsonb))
        with ordinality as ord(elem, ordinality)
  ),
  topics as (
    select coalesce(jsonb_agg(ord.elem order by o.position, o.deck_id, ord.ordinality), '[]'::jsonb) as v
      from ordered o
      cross join lateral jsonb_array_elements(coalesce(o.body->'topics','[]'::jsonb))
        with ordinality as ord(elem, ordinality)
  ),
  questions as (
    select coalesce(jsonb_agg(
             case when q.elem ? 't'
                  then jsonb_set(q.elem, '{t}', to_jsonb((q.elem->>'t')::int + o.t_off))
                  else q.elem end
             order by o.position, o.deck_id, q.ordinality
           ), '[]'::jsonb) as v
      from ordered o
      cross join lateral jsonb_array_elements(coalesce(o.body->'questions','[]'::jsonb))
        with ordinality as q(elem, ordinality)
  )
  select jsonb_build_object(
    'version', (select version from featured_meta where id = 1),
    'roots', (select v from roots),
    'decks', (select v from decks),
    'topics', (select v from topics),
    'questions', (select v from questions)
  );
$$;

/* Full rebuild kept for parity checks / emergency; builds every listed root. */
create or replace function public.featured_bundle_build()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare rid uuid;
begin
  for rid in select deck_id from featured_decks where listed loop
    insert into featured_bundle_shard (root_id, body, built_at)
      values (rid, featured_bundle_build_root(rid), now())
      on conflict (root_id) do update
        set body = excluded.body, built_at = excluded.built_at;
  end loop;
  delete from featured_bundle_shard s
   where not exists (select 1 from featured_decks f where f.deck_id = s.root_id and f.listed);
  return featured_bundle_compose();
end;
$$;

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
  rid uuid;
  body jsonb;
begin
  select version into s from featured_bundle_store where id = 1;
  if not pg_try_advisory_xact_lock(hashtext('featured_bundle_refresh')) then
    return s;
  end if;
  select version, changed_at into v, changed from featured_meta where id = 1;

  if force or s is null then
    insert into featured_bundle_dirty (root_id, marked_at)
      select deck_id, now() from featured_decks where listed
      on conflict (root_id) do update set marked_at = excluded.marked_at;
  end if;

  if s is not distinct from v
     and not exists (select 1 from featured_bundle_dirty) then
    return s;
  end if;

  if s is not null
     and not force
     and changed is not null
     and changed > now() - interval '45 seconds'
     and exists (select 1 from featured_bundle_store where id = 1) then
    return s;
  end if;

  -- Drop shards for roots no longer listed.
  delete from featured_bundle_shard sh
   where not exists (select 1 from featured_decks f where f.deck_id = sh.root_id and f.listed);

  for rid in
    select d.root_id from featured_bundle_dirty d
     where exists (select 1 from featured_decks f where f.deck_id = d.root_id and f.listed)
  loop
    body := featured_bundle_build_root(rid);
    if body is null or body->'root' is null then
      delete from featured_bundle_shard where root_id = rid;
    else
      insert into featured_bundle_shard (root_id, body, built_at)
        values (rid, body, now())
        on conflict (root_id) do update
          set body = excluded.body, built_at = excluded.built_at;
    end if;
  end loop;

  delete from featured_bundle_dirty;

  -- Any listed root still missing a shard (first boot / race): build it.
  for rid in
    select f.deck_id from featured_decks f
     where f.listed
       and not exists (select 1 from featured_bundle_shard s where s.root_id = f.deck_id)
  loop
    insert into featured_bundle_shard (root_id, body, built_at)
      values (rid, featured_bundle_build_root(rid), now())
      on conflict (root_id) do update
        set body = excluded.body, built_at = excluded.built_at;
  end loop;

  select version into v from featured_meta where id = 1;
  insert into featured_bundle_store (id, version, body, built_at)
    values (1, v, jsonb_set(featured_bundle_compose(), '{version}', to_jsonb(v)), now())
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
  perform set_config('statement_timeout', '120s', true);
  return public.featured_bundle_refresh(true);
end;
$$;

/* Triggers: dirty the affected root instead of only bumping a global counter. */
create or replace function public.tg_featured_questions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare rid uuid; rid2 uuid;
begin
  if tg_op = 'UPDATE' and old.deck_id is not distinct from new.deck_id then
    rid := featured_root_of(new.deck_id);
    if rid is not null then perform bump_featured_version(rid); end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then
    rid := featured_root_of(old.deck_id);
    if rid is not null then perform bump_featured_version(rid); end if;
  end if;
  if tg_op <> 'DELETE' then
    rid2 := featured_root_of(new.deck_id);
    if rid2 is not null and rid2 is distinct from rid then
      perform bump_featured_version(rid2);
    elsif rid2 is not null and rid is null then
      perform bump_featured_version(rid2);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.tg_featured_deck_rows()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare rid uuid;
begin
  if tg_op <> 'INSERT' then
    rid := coalesce(
      (select deck_id from featured_decks where deck_id = old.id),
      featured_root_of(old.parent_id),
      featured_root_of(old.id)
    );
    if rid is not null then perform bump_featured_version(rid); end if;
  end if;
  if tg_op <> 'DELETE' then
    rid := coalesce(
      (select deck_id from featured_decks where deck_id = new.id),
      featured_root_of(new.parent_id),
      featured_root_of(new.id)
    );
    if rid is not null then perform bump_featured_version(rid); end if;
  end if;
  return null;
end;
$$;

create or replace function public.tg_featured_decks()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Feature list changes can add/remove roots; dirty every listed root.
  perform bump_featured_version(null);
  return null;
end;
$$;

create or replace function public.tg_featured_byline()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.display_name is distinct from new.display_name
     and exists (
       select 1 from featured_decks f join decks d on d.id = f.deck_id
        where d.owner_id = new.id and f.listed
     ) then
    insert into featured_bundle_dirty (root_id, marked_at)
      select f.deck_id, now()
        from featured_decks f
        join decks d on d.id = f.deck_id
       where d.owner_id = new.id and f.listed
      on conflict (root_id) do update set marked_at = excluded.marked_at;
    update featured_meta set version = version + 1, changed_at = now() where id = 1;
  end if;
  return null;
end;
$$;

revoke all on function public.featured_bundle_build_root(uuid) from public, anon, authenticated;
revoke all on function public.featured_bundle_compose() from public, anon, authenticated;
revoke all on function public.featured_bundle_build() from public, anon, authenticated;
revoke all on function public.featured_bundle_refresh(boolean) from public, anon, authenticated;
revoke all on function public.bump_featured_version(uuid) from public, anon, authenticated;
revoke all on function public.featured_bundle_publish() from public, anon;
grant execute on function public.featured_bundle_publish() to authenticated;
