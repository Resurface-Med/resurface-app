-- Featured decks, fast (2026-10-29).
--
-- featured_content() sent every signed-in person all 3,300 featured
-- questions (4.4 MB) on every open, even when nothing had changed, and sent
-- each topic note once per question that shares it. This splits it:
--
--   featured_version()  a number that changes only when featured content
--                       does (triggers below). Tiny; anyone may ask.
--   featured_bundle()   the listed featured decks, the same for everyone, so
--                       it can be cached by version on Vercel's edge
--                       (api/featured) and on the device. Topic notes once
--                       each, in `topics`; a question carries `t`, its index.
--                       Readable without signing in (Rafil, 2026-10-29): the
--                       featured questions and notes only.
--   featured_mine()     the per-person part: hidden, your old copy, whether
--                       it is yours, and any unlisted deck shared with you.
--
-- featured_content() stays for app versions already on people's devices.

create table if not exists public.featured_meta (
  id int primary key default 1 check (id = 1),
  version bigint not null default 1,
  changed_at timestamptz not null default now()
);
insert into public.featured_meta (id) values (1) on conflict do nothing;
alter table public.featured_meta enable row level security;

/* Is this deck, or one above it, a featured root? */
create or replace function public.in_featured_tree(d uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  with recursive up as (
    select id, parent_id, 0 n from decks where id = d
    union all
    select p.id, p.parent_id, up.n + 1 from decks p join up on p.id = up.parent_id where up.n < 30
  )
  select d is not null and exists (select 1 from featured_decks f where f.deck_id in (select id from up));
$$;

create or replace function public.bump_featured_version()
returns void language sql security definer set search_path to 'public' as $$
  update featured_meta set version = version + 1, changed_at = now() where id = 1;
$$;

create or replace function public.tg_featured_decks() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin perform bump_featured_version(); return null; end $$;

create or replace function public.tg_featured_questions() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if (tg_op <> 'INSERT' and in_featured_tree(old.deck_id))
     or (tg_op <> 'DELETE' and in_featured_tree(new.deck_id)) then
    perform bump_featured_version();
  end if;
  return null;
end $$;

create or replace function public.tg_featured_deck_rows() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if (tg_op <> 'INSERT' and (exists (select 1 from featured_decks where deck_id = old.id) or in_featured_tree(old.parent_id)))
     or (tg_op <> 'DELETE' and (exists (select 1 from featured_decks where deck_id = new.id) or in_featured_tree(new.parent_id))) then
    perform bump_featured_version();
  end if;
  return null;
end $$;

create or replace function public.tg_featured_byline() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if old.display_name is distinct from new.display_name
     and exists (select 1 from featured_decks f join decks d on d.id = f.deck_id where d.owner_id = new.id) then
    perform bump_featured_version();
  end if;
  return null;
end $$;

drop trigger if exists featured_version_decks_tbl on public.featured_decks;
create trigger featured_version_decks_tbl after insert or update or delete on public.featured_decks
  for each statement execute function public.tg_featured_decks();
drop trigger if exists featured_version_questions on public.generated_questions;
create trigger featured_version_questions after insert or update or delete on public.generated_questions
  for each row execute function public.tg_featured_questions();
drop trigger if exists featured_version_deck_rows on public.decks;
create trigger featured_version_deck_rows after insert or update or delete on public.decks
  for each row execute function public.tg_featured_deck_rows();
drop trigger if exists featured_version_byline on public.profiles;
create trigger featured_version_byline after update of display_name on public.profiles
  for each row execute function public.tg_featured_byline();

create or replace function public.featured_version()
returns bigint language sql stable security definer set search_path to 'public' as $$
  select version from featured_meta where id = 1;
$$;

create or replace function public.featured_bundle()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, f.byline, f.position, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5('featured-folder:' || lower(trim(f.folder)))::uuid end top
      from featured_decks f where f.listed
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.position, d.id root, d.owner_id from decks d join roots r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.position, t.root, c.owner_id from decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
  ),
  q as (
    select g.id, g.deck_id, g.payload - 'topic' p, g.payload -> 'topic' topic
      from generated_questions g where g.deck_id in (select id from tree)
  ),
  topics as (
    select topic, (row_number() over (order by min(id)) - 1) idx from q where topic is not null group by topic
  )
  select jsonb_build_object(
    'version', (select version from featured_meta where id = 1),
    'roots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'top', r.top,
        'byline', coalesce(nullif(trim(r.byline), ''), nullif(trim(p.display_name), ''), 'Someone'),
        'position', r.position, 'shareCode', d.share_code
      ) order by r.position)
      from roots r join decks d on d.id = r.id left join profiles p on p.id = d.owner_id), '[]'::jsonb),
    'decks', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', r.top, 'name', r.folder, 'position', 0, 'root', r.id, 'parentId', null) x
          from roots r where r.folder is not null
        union all
        select jsonb_build_object(
          'id', t.id, 'name', coalesce(r.renames ->> t.id::text, t.name),
          'position', case when t.id = t.root then r.position else t.position end,
          'root', t.root,
          'parentId', case when t.id = t.root then (case when r.folder is null then null else r.top end) else t.parent_id end)
          from tree t join roots r on r.id = t.root
      ) s), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(topic order by idx) from topics), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'deckId', q.deck_id, 'payload', q.p)
             || case when t.idx is null then '{}'::jsonb else jsonb_build_object('t', t.idx) end)
      from q left join topics t on t.topic = q.topic), '[]'::jsonb)
  );
$$;

/* The unlisted featured decks shared with you: featured_content's shape. */
create or replace function public.featured_extra()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, d.owner_id = auth.uid() mine, f.byline, f.position, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5('featured-folder:' || lower(trim(f.folder)))::uuid end top
      from featured_decks f join decks d on d.id = f.deck_id
     where auth.uid() is not null and not f.listed
       and (d.owner_id <> auth.uid() or f.owner_sees)
       and exists (select 1 from featured_audience a where a.deck_id = f.deck_id and a.user_id = auth.uid())
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.position, d.id root, d.owner_id from decks d join roots r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.position, t.root, c.owner_id from decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
  )
  select jsonb_build_object(
    'roots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'mine', r.mine, 'top', r.top,
        'byline', coalesce(nullif(trim(r.byline), ''), nullif(trim(p.display_name), ''), 'Someone'),
        'position', r.position, 'shareCode', null,
        'hidden', exists (select 1 from featured_hidden h where h.user_id = auth.uid() and h.deck_id = r.id),
        'copyId', (select c.id from decks c where c.owner_id = auth.uid() and c.source_deck_id = r.id order by c.created_at desc limit 1)
      ) order by r.position)
      from roots r join decks d on d.id = r.id left join profiles p on p.id = d.owner_id), '[]'::jsonb),
    'decks', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', r.top, 'name', r.folder, 'position', 0, 'root', r.id, 'parentId', null) x
          from roots r where r.folder is not null
        union all
        select jsonb_build_object(
          'id', t.id, 'name', coalesce(r.renames ->> t.id::text, t.name),
          'position', case when t.id = t.root then r.position else t.position end,
          'root', t.root,
          'parentId', case when t.id = t.root then (case when r.folder is null then null else r.top end) else t.parent_id end)
          from tree t join roots r on r.id = t.root
      ) s), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'payload', g.payload, 'deckId', g.deck_id))
      from generated_questions g where g.deck_id in (select id from tree)), '[]'::jsonb)
  );
$$;

create or replace function public.featured_mine()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'version', (select version from featured_meta where id = 1),
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

revoke all on function public.featured_version() from public;
revoke all on function public.featured_bundle() from public;
revoke all on function public.featured_extra() from public;
revoke all on function public.featured_mine() from public;
revoke all on function public.in_featured_tree(uuid) from public;
revoke all on function public.bump_featured_version() from public;
grant execute on function public.featured_version() to anon, authenticated;
grant execute on function public.featured_bundle() to anon, authenticated;
grant execute on function public.featured_mine() to authenticated;
grant execute on function public.featured_extra() to authenticated;
