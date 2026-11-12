-- What a deck covers (2026-11-12).
--
-- Lecture-named decks hide their conditions: Addison's is in "Adrenal
-- Insufficiency", DKA in "Diabetic Emergency". Putting the conditions in the
-- name made names too long (Rafil), so they go in decks.covers instead: a
-- short line drawn under the deck's name in the list, and matched by the
-- deck search. The bundle carries it for featured decks.

alter table public.decks add column if not exists covers text;

create or replace function public.featured_bundle_build()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, f.byline, f.position, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5('featured-folder:' || lower(trim(f.folder)))::uuid end top
      from featured_decks f where f.listed
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.covers, d.position, d.id root, d.owner_id from decks d join roots r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.covers, c.position, t.root, c.owner_id from decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
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
          || case when nullif(trim(t.covers), '') is null then '{}'::jsonb else jsonb_build_object('covers', trim(t.covers)) end
          from tree t join roots r on r.id = t.root
      ) s), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(topic order by idx) from topics), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'deckId', q.deck_id, 'payload', q.p)
             || case when t.idx is null then '{}'::jsonb else jsonb_build_object('t', t.idx) end)
      from q left join topics t on t.topic = q.topic), '[]'::jsonb)
  );
$$;
