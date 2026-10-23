-- Rafil sees his own Principles as a ready-made deck (2026-10-23).
-- featured_content left out decks you own; with owner_sees on, yours is
-- served too, marked mine, and the app hides your own copy of that tree so
-- nothing shows twice. Per deck: Jacob still sees Renal as his.
alter table public.featured_decks add column if not exists owner_sees boolean not null default false;
update public.featured_decks set owner_sees = true where deck_id = 'ef991260-2b23-484f-8bd3-798e1a4f1898';

create or replace function public.featured_content()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, d.owner_id = auth.uid() mine, f.byline, f.position, f.listed, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5('featured-folder:' || lower(trim(f.folder)))::uuid end top
      from featured_decks f join decks d on d.id = f.deck_id
     where auth.uid() is not null
       and (d.owner_id <> auth.uid() or f.owner_sees)
       and (f.listed or exists (
         select 1 from featured_audience a
          where a.deck_id = f.deck_id and a.user_id = auth.uid()
       ))
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.position, d.id root, d.owner_id from decks d join roots r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.position, t.root, c.owner_id from decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
  )
  select jsonb_build_object(
    'roots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'mine', r.mine,
        'top', r.top,
        'byline', coalesce(nullif(trim(r.byline), ''), nullif(trim(p.display_name), ''), 'Someone'),
        'position', r.position,
        'shareCode', case when r.listed then d.share_code else null end,
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

