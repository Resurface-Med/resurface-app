-- An edit to your own question goes into the question, for everyone
-- (2026-10-26).
--
-- The Edit button saved every correction to question_edits, a personal
-- overlay, including corrections to your own questions. For a deck that is
-- shared or featured, that meant the owner saw the fix and nobody else did:
-- Jacob had fixed 4 Renal questions that every student still saw unfixed.
--
-- This makes it impossible whatever the app does, including an old copy of
-- it still cached on a phone: a write to question_edits for a question the
-- writer owns is turned into an update of the question itself, and the
-- overlay row is never stored. Corrections to other people's questions are
-- untouched and stay personal.

create or replace function public.own_edit_to_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.generated_questions g
     set payload = g.payload || new.payload
   where g.id = new.question_id - 1000000
     and g.user_id = new.user_id;
  if found then
    return null;   -- applied to the question itself; keep no overlay
  end if;
  return new;
end $$;

drop trigger if exists own_edit_to_source on public.question_edits;
create trigger own_edit_to_source
  before insert or update on public.question_edits
  for each row execute function public.own_edit_to_source();

-- The ones already stuck in overlays: into the questions, then gone.
update public.generated_questions g
   set payload = g.payload || e.payload
  from public.question_edits e
 where g.id = e.question_id - 1000000
   and g.user_id = e.user_id;

delete from public.question_edits e
 using public.generated_questions g
 where g.id = e.question_id - 1000000
   and g.user_id = e.user_id;
