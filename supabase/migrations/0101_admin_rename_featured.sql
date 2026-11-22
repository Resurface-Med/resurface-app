-- Admins rename any ready-made deck (2026-11-22).
--
-- Rafil: name changing on all decks for admins. A ready-made deck belongs
-- to whoever built it (Jacob's, Rafil's), so an admin could rename only
-- their own. This renames any deck in a featured tree, at any depth, on the
-- deck itself, so everyone sees it, its owner included, and clears any
-- old override for it in featured_decks.renames, which would otherwise
-- keep showing instead. The year headings are not decks (they are
-- featured_decks.folder, matched by name to a student's year) and are not
-- renamed here.

create or replace function public.admin_rename_featured_deck(deck uuid, new_name text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  n text := btrim(coalesce(new_name, ''));
  rid uuid;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if char_length(n) < 1 or char_length(n) > 80 then
    raise exception 'A deck name is 1 to 80 characters.' using errcode = '22023';
  end if;
  rid := public.featured_root_of(deck);
  if rid is null then raise exception 'That is not a ready-made deck.' using errcode = '42501'; end if;
  update decks set name = n, updated_at = now() where id = deck;
  update featured_decks set renames = renames - deck::text where deck_id = rid and renames ? deck::text;
end $$;

revoke all on function public.admin_rename_featured_deck(uuid, text) from public, anon;
grant execute on function public.admin_rename_featured_deck(uuid, text) to authenticated;
