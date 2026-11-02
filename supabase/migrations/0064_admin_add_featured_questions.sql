-- Admins add questions to a Resurface deck (2026-11-02).
--
-- Jacob, Rayan and Rafil upload questions as a JSON file from a deck's ⋯
-- menu, review and edit them, then add them. A Resurface deck belongs to
-- one person's account (Year 2 is Jacob's), so another admin cannot insert
-- into it directly; this does it for them. The questions go in under the
-- deck owner's account, exactly like the deck's own. Admins only, and only
-- into a featured deck's tree. Adds; never changes or removes anything.

create or replace function public.admin_add_featured_questions(deck uuid, rows jsonb)
returns bigint[] language plpgsql security definer set search_path to 'public' as $$
declare owner uuid; ids bigint[];
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if not public.in_featured_tree(deck) then raise exception 'not a Resurface deck'; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then raise exception 'no questions'; end if;
  if jsonb_array_length(rows) > 500 then raise exception 'at most 500 at a time'; end if;
  select d.owner_id into owner from decks d where d.id = deck;
  with ins as (
    insert into generated_questions (user_id, deck_id, payload)
    select owner, deck, r.value - 'id' - 'gen' - 'featured' - 'deckId' - 'path'
    from jsonb_array_elements(rows) with ordinality r(value, i)
    order by r.i
    returning id
  )
  select array_agg(id order by id) into ids from ins;
  return ids;
end; $$;

revoke all on function public.admin_add_featured_questions(uuid, jsonb) from public, anon;
grant execute on function public.admin_add_featured_questions(uuid, jsonb) to authenticated;
