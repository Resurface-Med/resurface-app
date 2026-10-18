-- Featured decks: a folder around them, and names tidied (2026-10-18).
--
-- Rafil wanted Jacob's Renal shown inside "Year 2", with "Year 2 by Jacob"
-- on the folder, and "physiology" capitalised. Done here, in how the deck is
-- presented to everyone, rather than in Jacob's own account: his decks stay
-- as he made them, and nothing he does to them later is fought over.
--
--   folder  — a folder the featured deck is shown inside; it carries the
--             byline. Not a real deck: its id is derived from the root's.
--   renames — { "<deck id>": "Shown name" } for any deck in the tree.
--
-- roots[].id stays the real root (what hiding and copies are keyed on);
-- roots[].top is what is drawn at the top of the list — the folder if there
-- is one, the root otherwise.

alter table public.featured_decks
  add column if not exists folder text,
  add column if not exists renames jsonb not null default '{}'::jsonb;

create or replace function public.featured_content()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, f.byline, f.position, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5(f.deck_id::text || ':folder')::uuid end top
      from featured_decks f join decks d on d.id = f.deck_id
     where auth.uid() is not null and d.owner_id <> auth.uid()
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.position, d.id root from decks d join roots r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.position, t.root from decks c join tree t on c.parent_id = t.id
  )
  select jsonb_build_object(
    'roots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'top', r.top,
        'byline', coalesce(nullif(trim(r.byline), ''), nullif(trim(p.display_name), ''), 'Someone'),
        'position', r.position,
        'shareCode', d.share_code,
        'hidden', exists (select 1 from featured_hidden h where h.user_id = auth.uid() and h.deck_id = r.id),
        'copyId', (select c.id from decks c where c.owner_id = auth.uid() and c.source_deck_id = r.id
                    order by c.created_at desc limit 1)
      ) order by r.position)
      from roots r join decks d on d.id = r.id left join profiles p on p.id = d.owner_id), '[]'::jsonb),
    'decks', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', r.top, 'name', r.folder, 'position', 0, 'root', r.id, 'parentId', null) x
          from roots r where r.folder is not null
        union all
        select jsonb_build_object(
          'id', t.id, 'name', coalesce(r.renames ->> t.id::text, t.name), 'position', t.position, 'root', t.root,
          'parentId', case when t.id = t.root then (case when r.folder is null then null else r.top end) else t.parent_id end)
          from tree t join roots r on r.id = t.root
      ) s), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'payload', g.payload, 'deckId', g.deck_id))
      from generated_questions g where g.deck_id in (select id from tree)), '[]'::jsonb)
  );
$$;

update public.featured_decks
   set folder = 'Year 2',
       renames = renames || '{"86d498e2-0625-4bd8-bb0b-b85a46d2ffaa": "Physiology"}'::jsonb
 where deck_id = 'f43ea162-6c44-4648-a418-5a5f55a3260b';
