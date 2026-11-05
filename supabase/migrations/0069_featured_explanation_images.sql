-- Pictures in explanations are seen by everyone too (2026-11-05), as 0065
-- and 0066 did for a question's picture and its topic note's.
create or replace function public.question_image_is_featured(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.generated_questions g
    where (g.payload->>'img' = path
        or strpos(g.payload->'topic'->>'body', '](' || path || ')') > 0
        or strpos(g.payload->>'exp', '](' || path || ')') > 0)
      and public.in_featured_tree(g.deck_id)
  );
$$;
