-- For the Claude connector (resurface-backend /api/mcp). Both run as the
-- caller (security invoker), so row-level security still decides what they
-- see: your own questions only. Applied 2026-11-06.

-- How many questions each of your decks holds, in one round trip instead of
-- paging through every question to count them.
create or replace function public.my_deck_counts()
returns table (deck_id uuid, questions integer)
language sql stable security invoker set search_path = public as $$
  select g.deck_id, count(*)::int
    from generated_questions g
   where g.user_id = auth.uid()
   group by g.deck_id
$$;

-- Finds your questions by text: the stem, options, explanation and topic
-- note title. Optionally within one deck and everything inside it.
create or replace function public.my_question_search(q text, within uuid default null, lim integer default 30)
returns table (id bigint, deck_id uuid, payload jsonb)
language sql stable security invoker set search_path = public as $$
  with recursive t as (
    select d.id from decks d where d.id = within and d.owner_id = auth.uid()
    union all
    select d.id from decks d join t on d.parent_id = t.id where d.owner_id = auth.uid()
  )
  select g.id, g.deck_id, g.payload
    from generated_questions g
   where g.user_id = auth.uid()
     and (within is null or g.deck_id in (select t.id from t))
     and (
       g.payload->>'q' ilike '%' || q || '%'
       or g.payload->>'exp' ilike '%' || q || '%'
       or (g.payload->'opts')::text ilike '%' || q || '%'
       or g.payload->'topic'->>'title' ilike '%' || q || '%'
     )
   order by g.id
   limit least(greatest(coalesce(lim, 30), 1), 100)
$$;

revoke all on function public.my_deck_counts() from public, anon;
revoke all on function public.my_question_search(text, uuid, integer) from public, anon;
grant execute on function public.my_deck_counts() to authenticated;
grant execute on function public.my_question_search(text, uuid, integer) to authenticated;
