-- Your own questions, without the ones the bundle already brings
-- (2026-11-22).
--
-- loadAll read every generated_questions row you own and App then dropped
-- those under a ready-made deck of yours that you see as ready-made
-- (lib/decks servedTree): they come in the shared bundle. For the owner of
-- the ready-made decks that was all 11,283 of their rows, 17 MB stored, on
-- every load and refresh, thrown away, while the project was over its
-- egress allowance. This leaves out the same rows here: a listed featured
-- deck you own and see (owner_sees), not hidden by you, and every deck
-- under it. It may leave out less than App drops (an unlisted deck shared
-- with you is still sent), never more.
--
-- Definer's rights, since featured_decks and featured_hidden have no
-- policies a student can read through; user_id = auth.uid() is what keeps
-- it to your own rows.

create or replace function public.my_generated()
returns setof public.generated_questions
language sql stable security definer set search_path to 'public' as $$
  with recursive served as (
    select f.deck_id as id
      from featured_decks f join decks d on d.id = f.deck_id
     where d.owner_id = auth.uid() and f.listed and f.owner_sees
       and not exists (select 1 from featured_hidden h where h.user_id = auth.uid() and h.deck_id = f.deck_id)
    union
    select c.id from decks c join served s on c.parent_id = s.id
  )
  select g.* from generated_questions g
   where g.user_id = auth.uid()
     and (g.deck_id is null or g.deck_id not in (select id from served))
$$;

revoke all on function public.my_generated() from public, anon;
grant execute on function public.my_generated() to authenticated;
