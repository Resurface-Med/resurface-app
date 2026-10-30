-- Link previews for shared decks (2026-10-28).
--
-- WhatsApp, iMessage and the rest fetch a shared link (/d/<code>) without
-- signing in, so deck_preview (which needs a signed-in caller) gave them
-- nothing and every deck showed the generic "Resurface" card. This answers
-- anyone holding the link with three things only: the deck's name, how many
-- questions it holds, and the sharer's first name. No questions, no other
-- decks, no surname. The app's api/deck-page and api/og read it.

create or replace function public.deck_link_preview(code text)
returns table(name text, questions bigint, owner_name text)
language sql stable security definer set search_path to 'public' as $$
  with recursive src as (
    select d.id, d.name, d.owner_id from public.decks d where d.share_code = code
  ),
  tree as (
    select id, owner_id from src
    union all
    select c.id, c.owner_id from public.decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
  )
  select
    s.name,
    (select count(*) from public.generated_questions g where g.deck_id in (select id from tree)),
    split_part(coalesce(nullif(trim(p.display_name), ''), 'Someone'), ' ', 1)
  from src s left join public.profiles p on p.id = s.owner_id;
$$;

revoke all on function public.deck_link_preview(text) from public;
grant execute on function public.deck_link_preview(text) to anon, authenticated;
