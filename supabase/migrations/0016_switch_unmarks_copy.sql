-- After switching to a featured deck, what is left of the old copy (only the
-- questions you added yourself, and their decks) is no longer a copy of it.
-- Without this the app saw "you have a copy" on every load and switched
-- again, to no effect (2026-10-18). Also safe to run twice in one
-- transaction: the scratch table is dropped first.

create or replace function public.switch_to_featured(copy uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); moved int; n int;
begin
  if me is null or not exists (select 1 from decks where id = copy and owner_id = me) then return 0; end if;

  drop table if exists _pairs;
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

  with recursive mine as (
    select id from decks where id = copy
    union all select c.id from decks c join mine m on c.parent_id = m.id
  )
  update decks set source_deck_id = null where id in (select id from mine) and owner_id = me;

  return moved;
end; $$;
