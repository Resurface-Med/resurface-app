-- Featured decks (2026-10-18): one person's deck, live for everyone.
--
-- Sharing makes a copy, and a copy stops at the moment it was made: the
-- owner's later fixes and new questions never reach it. A featured deck is
-- not copied. Everyone reads the one deck, so what its owner changes is what
-- everyone sees on their next load. Progress needs nothing new — practice
-- stats, review cards and bookmarks are keyed on a bare question id with no
-- owner check, so answering someone else's question records like your own.
--
-- Read through one function rather than by opening the decks and questions
-- tables' policies: the app reads those tables unfiltered and relies on RLS
-- to mean "yours", so a wider policy would have put the deck among everyone's
-- own, with Rename and Delete on it.
--
-- Which decks are featured is set here, by hand, for now:
--   insert into featured_decks (deck_id, byline) values ('<root deck id>', 'Jacob');

create table if not exists public.featured_decks (
  deck_id uuid primary key references public.decks (id) on delete cascade,
  byline text,                       -- "by …" on the row; the owner's display name when null
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.featured_decks enable row level security;
-- No policies: read only through featured_content().

-- Someone who would rather not see one.
create table if not exists public.featured_hidden (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  primary key (user_id, deck_id)
);
alter table public.featured_hidden enable row level security;
create policy "own hidden featured" on public.featured_hidden for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Every featured deck, its sub-decks and its questions, in one read. Not your
-- own: the owner sees theirs as the ordinary deck it is.
create or replace function public.featured_content()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, f.byline, f.position
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
        'byline', coalesce(nullif(trim(r.byline), ''), nullif(trim(p.display_name), ''), 'Someone'),
        'position', r.position,
        'shareCode', d.share_code,
        'hidden', exists (select 1 from featured_hidden h where h.user_id = auth.uid() and h.deck_id = r.id),
        'copyId', (select c.id from decks c where c.owner_id = auth.uid() and c.source_deck_id = r.id
                    order by c.created_at desc limit 1)
      ) order by r.position)
      from roots r join decks d on d.id = r.id left join profiles p on p.id = d.owner_id), '[]'::jsonb),
    'decks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'position', t.position, 'root', t.root,
        'parentId', case when t.id = t.root then null else t.parent_id end))
      from tree t), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'payload', g.payload, 'deckId', g.deck_id))
      from generated_questions g where g.deck_id in (select id from tree)), '[]'::jsonb)
  );
$$;

-- From your old copy to the live deck.
--
-- Every question in the copy that came from the featured deck hands its
-- progress (stats, review card, bookmark) to the original — the app keys
-- those on 1_000_000 + the row id (GEN_ID_BASE in src/data/index.js) — and is
-- deleted. Questions you added to the copy yourself stay, and so do the decks
-- holding them; decks left empty go. Where you somehow have progress on both,
-- the original's is kept.
create or replace function public.switch_to_featured(copy uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); moved int; n int;
begin
  if me is null or not exists (select 1 from decks where id = copy and owner_id = me) then return 0; end if;

  create temporary table _pairs on commit drop as
  with recursive mine as (
    select id from decks where id = copy
    union all select c.id from decks c join mine m on c.parent_id = m.id
  ),
  featured as (
    select f.deck_id id from featured_decks f
    union all select c.id from decks c join featured t on c.parent_id = t.id
  )
  select g.id old_id, s.id new_id
    from generated_questions g join generated_questions s on s.id = g.source_question_id
   where g.user_id = me and g.deck_id in (select id from mine) and s.deck_id in (select id from featured);
  get diagnostics moved = row_count;

  update practice_stats p set question_id = 1000000 + x.new_id from _pairs x
   where p.user_id = me and p.question_id = 1000000 + x.old_id
     and not exists (select 1 from practice_stats q where q.user_id = me and q.question_id = 1000000 + x.new_id);
  delete from practice_stats p using _pairs x where p.user_id = me and p.question_id = 1000000 + x.old_id;

  update sr_cards p set question_id = 1000000 + x.new_id from _pairs x
   where p.user_id = me and p.question_id = 1000000 + x.old_id
     and not exists (select 1 from sr_cards q where q.user_id = me and q.question_id = 1000000 + x.new_id);
  delete from sr_cards p using _pairs x where p.user_id = me and p.question_id = 1000000 + x.old_id;

  update bookmarks p set question_id = 1000000 + x.new_id from _pairs x
   where p.user_id = me and p.question_id = 1000000 + x.old_id
     and not exists (select 1 from bookmarks q where q.user_id = me and q.question_id = 1000000 + x.new_id);
  delete from bookmarks p using _pairs x where p.user_id = me and p.question_id = 1000000 + x.old_id;

  delete from generated_questions g using _pairs x where g.id = x.old_id and g.user_id = me;

  -- Empty decks of the copy, from the leaves up.
  loop
    with recursive mine as (
      select id from decks where id = copy
      union all select c.id from decks c join mine m on c.parent_id = m.id
    )
    delete from decks d where d.id in (select id from mine) and d.owner_id = me
      and not exists (select 1 from decks c where c.parent_id = d.id)
      and not exists (select 1 from generated_questions g where g.deck_id = d.id);
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;

  return moved;
end; $$;

revoke all on function public.featured_content() from public, anon;
revoke all on function public.switch_to_featured(uuid) from public, anon;
grant execute on function public.featured_content() to authenticated;
grant execute on function public.switch_to_featured(uuid) to authenticated;

insert into public.featured_decks (deck_id, byline)
values ('f43ea162-6c44-4648-a418-5a5f55a3260b', 'Jacob')
on conflict (deck_id) do nothing;
