-- Admins control the Resurface (featured) decks (2026-10-19).
--
-- Edit and delete their questions — these are the owner's real questions, so
-- the owner's deck changes too — choose which decks are featured, and set the
-- folder they are shown in, the "by …" credit and any sub-deck renames.
-- Every function checks is_admin() itself; question edits and deletes are
-- also refused for anything outside a featured deck.

create or replace function public.is_featured_question(qid bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  with recursive t as (
    select deck_id id from featured_decks
    union all select d.id from decks d join t on d.parent_id = t.id
  )
  select exists (select 1 from generated_questions g where g.id = qid and g.deck_id in (select id from t));
$$;
revoke all on function public.is_featured_question(bigint) from public, anon, authenticated;

-- The answerable part of a question, replaced; other keys are kept.
create or replace function public.admin_edit_featured_question(qid bigint, body jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if not public.is_featured_question(qid) then raise exception 'not a featured question'; end if;
  update generated_questions
     set payload = payload || (body - 'id' - 'gen' - 'featured' - 'deckId' - 'path' - 'leaf' - 'rootId')
   where id = qid;
end; $$;

create or replace function public.admin_delete_featured_questions(ids bigint[])
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from generated_questions g where g.id = any (ids) and public.is_featured_question(g.id);
  get diagnostics n = row_count;
  return n;
end; $$;

-- What is featured, with what Admin needs to manage it.
create or replace function public.admin_featured_decks()
returns table (deck_id uuid, name text, owner_name text, owner_email text, byline text, folder text,
               renames jsonb, "position" integer, questions integer, subdecks jsonb)
language sql stable security definer set search_path to 'public' as $$
  select f.deck_id, d.name, nullif(trim(p.display_name), ''), u.email::text, f.byline, f.folder,
         f.renames, f.position, public.deck_tree_questions(f.deck_id),
         (with recursive t as (
            select c.id, c.parent_id, c.name, 1 depth, c.position from decks c where c.parent_id = f.deck_id
            union all select c.id, c.parent_id, c.name, t.depth + 1, c.position from decks c join t on c.parent_id = t.id
          ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'depth', depth) order by depth, position), '[]') from t)
  from featured_decks f
  join decks d on d.id = f.deck_id
  left join profiles p on p.id = d.owner_id
  left join auth.users u on u.id = d.owner_id
  where public.is_admin()
  order by f.position, f.created_at;
$$;

-- Decks that could be featured: everyone's top-level decks that are their
-- own (not copies of someone else's), largest first.
create or replace function public.admin_feature_candidates()
returns table (deck_id uuid, name text, owner_name text, owner_email text, questions integer)
language sql stable security definer set search_path to 'public' as $$
  select d.id, d.name, nullif(trim(p.display_name), ''), u.email::text, public.deck_tree_questions(d.id)
  from decks d
  left join profiles p on p.id = d.owner_id
  left join auth.users u on u.id = d.owner_id
  where public.is_admin()
    and d.parent_id is null and d.source_deck_id is null
    and not exists (select 1 from featured_decks f where f.deck_id = d.id)
    and public.deck_tree_questions(d.id) > 0
  order by public.deck_tree_questions(d.id) desc
  limit 200;
$$;

create or replace function public.admin_set_featured(deck uuid, p_byline text, p_folder text, p_renames jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into featured_decks (deck_id, byline, folder, renames)
  values (deck, nullif(trim(p_byline), ''), nullif(trim(p_folder), ''), coalesce(p_renames, '{}'))
  on conflict (deck_id) do update
    set byline = excluded.byline, folder = excluded.folder, renames = excluded.renames;
end; $$;

create or replace function public.admin_unfeature(deck uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from featured_decks where deck_id = deck;
end; $$;

revoke all on function public.admin_edit_featured_question(bigint, jsonb) from public, anon;
revoke all on function public.admin_delete_featured_questions(bigint[]) from public, anon;
revoke all on function public.admin_featured_decks() from public, anon;
revoke all on function public.admin_feature_candidates() from public, anon;
revoke all on function public.admin_set_featured(uuid, text, text, jsonb) from public, anon;
revoke all on function public.admin_unfeature(uuid) from public, anon;
grant execute on function public.admin_edit_featured_question(bigint, jsonb) to authenticated;
grant execute on function public.admin_delete_featured_questions(bigint[]) to authenticated;
grant execute on function public.admin_featured_decks() to authenticated;
grant execute on function public.admin_feature_candidates() to authenticated;
grant execute on function public.admin_set_featured(uuid, text, text, jsonb) to authenticated;
grant execute on function public.admin_unfeature(uuid) to authenticated;
