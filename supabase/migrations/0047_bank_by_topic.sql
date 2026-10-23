-- Principles is organised by topic, not week (Rafil, 2026-10-23): weeks
-- were his year's timetable and change year to year. The deck was moved to
-- Principles › Subject › Lecture by hand; bank_load now files new
-- questions that way too, and ignores the week it is given.

create or replace function public.bank_load(me uuid, items jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  root uuid; subj uuid; lec uuid;
  r jsonb; q jsonb; n int := 0;
begin
  select id into root from decks where owner_id = me and parent_id is null and name = 'Principles' and source_deck_id is null;
  if root is null then
    insert into decks (owner_id, name, position)
    values (me, 'Principles', coalesce((select max(position) from decks where owner_id = me and parent_id is null), 0) + 1024)
    returning id into root;
  end if;

  for r in select * from jsonb_array_elements(items) loop
    select id into subj from decks where parent_id = root and name = r->>'subject';
    if subj is null then
      insert into decks (owner_id, parent_id, name, position)
      values (me, root, r->>'subject', coalesce((select max(position) from decks where parent_id = root), 0) + 1024) returning id into subj;
    end if;
    select id into lec from decks where parent_id = subj and name = r->>'title';
    if lec is null then
      insert into decks (owner_id, parent_id, name, position)
      values (me, subj, r->>'title', coalesce((select max(position) from decks where parent_id = subj), 0) + 1024) returning id into lec;
    end if;
    for q in select * from jsonb_array_elements(r->'questions') loop
      continue when exists (select 1 from generated_questions where deck_id = lec and payload->>'q' = q->>'q');
      insert into generated_questions (user_id, deck_id, payload) values (me, lec, q);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.bank_load(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bank_load(uuid, jsonb) to service_role;
