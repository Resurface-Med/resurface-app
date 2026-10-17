-- Shared decks remember where they came from (2026-10-17).
--
-- Receiving a deck always made a whole new copy, which knew nothing of its
-- original: receive the same deck twice and every question was there twice.
-- Now a copy records the deck and question it came from, so the app can
-- tell "you already have this" and add only what is new, and the copy can
-- leave out questions the recipient already has.

alter table public.decks
  add column if not exists source_deck_id uuid references public.decks (id) on delete set null;
alter table public.generated_questions
  add column if not exists source_question_id bigint references public.generated_questions (id) on delete set null;
create index if not exists decks_owner_source on public.decks (owner_id, source_deck_id);
create index if not exists gq_user_source on public.generated_questions (user_id, source_question_id);

-- ── Backfill: copies made before this, matched on identical questions ──
-- A question identical to an earlier one of someone else's is a copy of it.
with firsts as (
  select distinct on (payload) id, user_id, payload
  from public.generated_questions order by payload, created_at, id
)
update public.generated_questions g
   set source_question_id = f.id
  from firsts f
 where f.payload = g.payload and g.id <> f.id and g.user_id <> f.user_id
   and g.source_question_id is null;

-- A deck holding copies came from the deck most of them came from.
with votes as (
  select g.deck_id, s.deck_id src, count(*) n,
         row_number() over (partition by g.deck_id order by count(*) desc) r
  from public.generated_questions g
  join public.generated_questions s on s.id = g.source_question_id
  where g.deck_id is not null and s.deck_id is not null
  group by g.deck_id, s.deck_id
)
update public.decks d set source_deck_id = v.src
  from votes v where v.deck_id = d.id and v.r = 1 and d.source_deck_id is null;

-- A folder came from the deck its sub-decks' originals sit in (twice, for
-- folders of folders).
do $$
begin
  for i in 1..3 loop
    with votes as (
      select c.parent_id folder, s.parent_id src, count(*) n,
             row_number() over (partition by c.parent_id order by count(*) desc) r
      from public.decks c
      join public.decks s on s.id = c.source_deck_id
      where c.parent_id is not null and s.parent_id is not null
      group by c.parent_id, s.parent_id
    )
    update public.decks d set source_deck_id = v.src
      from votes v where v.folder = d.id and v.r = 1 and d.source_deck_id is null;
  end loop;
end $$;

-- ── Copying, now recording origins and able to leave questions out ──
drop function if exists public.copy_deck_by_code(text);
drop function if exists public.copy_deck_tree(uuid, uuid, uuid);

create or replace function public.copy_deck_tree(src_id uuid, new_owner uuid, new_parent uuid, skip bigint[] default '{}')
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare src public.decks%rowtype; new_id uuid; child record;
begin
  select * into src from public.decks where id = src_id;
  insert into public.decks (owner_id, parent_id, name, position, source_deck_id)
    values (new_owner, new_parent, src.name, src.position, src.id) returning id into new_id;
  insert into public.generated_questions (user_id, payload, deck_id, source_question_id)
    select new_owner, payload, new_id, id from public.generated_questions
     where deck_id = src_id and not (id = any (skip));
  for child in select id from public.decks where parent_id = src_id order by position, created_at loop
    perform public.copy_deck_tree(child.id, new_owner, new_id, skip);
  end loop;
  return new_id;
end; $$;

create or replace function public.copy_deck_by_code(code text, skip bigint[] default '{}')
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare src public.decks%rowtype; me uuid := auth.uid();
begin
  if me is null then return null; end if;
  select * into src from public.decks where share_code = code;
  if src.id is null then return null; end if;
  if src.owner_id = me then return src.id; end if;
  return public.copy_deck_tree(src.id, me, null, coalesce(skip, '{}'));
end; $$;

-- ── Bringing a copy up to date: what is new in the original, added ──
create or replace function public.update_copy_tree(src_id uuid, copy_id uuid, me uuid, skip bigint[] default '{}')
returns integer language plpgsql security definer set search_path to 'public' as $$
declare added int := 0; n int; child record; sub uuid;
begin
  insert into public.generated_questions (user_id, payload, deck_id, source_question_id)
    select me, g.payload, copy_id, g.id from public.generated_questions g
     where g.deck_id = src_id and not (g.id = any (skip))
       and not exists (select 1 from public.generated_questions m where m.user_id = me and m.source_question_id = g.id);
  get diagnostics n = row_count; added := added + n;
  for child in select id, name, position from public.decks where parent_id = src_id order by position, created_at loop
    select id into sub from public.decks where owner_id = me and source_deck_id = child.id order by created_at desc limit 1;
    if sub is null then
      insert into public.decks (owner_id, parent_id, name, position, source_deck_id)
        values (me, copy_id, child.name, child.position, child.id) returning id into sub;
    end if;
    added := added + public.update_copy_tree(child.id, sub, me, skip);
  end loop;
  return added;
end; $$;

create or replace function public.update_copy_by_code(code text, skip bigint[] default '{}')
returns integer language plpgsql security definer set search_path to 'public' as $$
declare src public.decks%rowtype; me uuid := auth.uid(); mine uuid;
begin
  if me is null then return 0; end if;
  select * into src from public.decks where share_code = code;
  if src.id is null or src.owner_id = me then return 0; end if;
  select id into mine from public.decks where owner_id = me and source_deck_id = src.id order by created_at desc limit 1;
  if mine is null then return 0; end if;
  return public.update_copy_tree(src.id, mine, me, coalesce(skip, '{}'));
end; $$;

-- The questions in a shared deck, for checking against your own before it
-- is added. Anyone with the link can already copy them.
create or replace function public.shared_questions(code text)
returns table (id bigint, q text, a text) language sql stable security definer set search_path to 'public' as $$
  with recursive tree as (
    select d.id from public.decks d where d.share_code = code and auth.uid() is not null
    union all
    select c.id from public.decks c join tree t on c.parent_id = t.id
  )
  select g.id, g.payload->>'q', g.payload->'opts'->>((g.payload->>'ans')::int)
  from public.generated_questions g where g.deck_id in (select id from tree);
$$;

-- The preview now also says whether you have a copy, and what is new.
drop function if exists public.deck_preview(text);
create or replace function public.deck_preview(code text)
returns table (name text, questions bigint, decks bigint, owner_name text, mine boolean, copy_id uuid, new_questions bigint)
language sql stable security definer set search_path to 'public' as $$
  with recursive src as (
    select d.id, d.name, d.owner_id from public.decks d
     where d.share_code = code and auth.uid() is not null
  ),
  tree as (
    select id from src
    union all
    select c.id from public.decks c join tree t on c.parent_id = t.id
  ),
  my_copy as (
    select d.id from public.decks d, src
     where d.owner_id = auth.uid() and d.source_deck_id = src.id
     order by d.created_at desc limit 1
  )
  select
    s.name,
    (select count(*) from public.generated_questions g where g.deck_id in (select id from tree)),
    (select count(*) from tree) - 1,
    coalesce(nullif(trim(p.display_name), ''), 'Someone'),
    s.owner_id = auth.uid(),
    (select id from my_copy),
    (select count(*) from public.generated_questions g
      where g.deck_id in (select id from tree)
        and not exists (select 1 from public.generated_questions m
                         where m.user_id = auth.uid() and m.source_question_id = g.id))
  from src s left join public.profiles p on p.id = s.owner_id;
$$;

revoke all on function public.copy_deck_tree(uuid, uuid, uuid, bigint[]) from public, anon, authenticated;
revoke all on function public.update_copy_tree(uuid, uuid, uuid, bigint[]) from public, anon, authenticated;
revoke all on function public.copy_deck_by_code(text, bigint[]) from public, anon;
revoke all on function public.update_copy_by_code(text, bigint[]) from public, anon;
revoke all on function public.shared_questions(text) from public, anon;
grant execute on function public.copy_deck_by_code(text, bigint[]) to authenticated;
grant execute on function public.update_copy_by_code(text, bigint[]) to authenticated;
grant execute on function public.shared_questions(text) to authenticated;
grant execute on function public.deck_preview(text) to authenticated;
