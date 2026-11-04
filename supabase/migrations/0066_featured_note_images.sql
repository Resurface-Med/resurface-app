-- Pictures in topic notes are seen by everyone too (2026-11-04).
--
-- 0065 opened a question-images file to every signed-in person when a
-- question in a featured tree uses it as its picture (payload.img). Topic
-- notes can now hold pictures as lines of their own, ![caption](path), so a
-- file named in a featured question's note opens the same way. Everything
-- else stays owner-only.

create or replace function public.question_image_is_featured(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.generated_questions g
    where g.payload->>'img' = path
      and public.in_featured_tree(g.deck_id)
  ) or exists (
    select 1 from public.generated_questions g
    where strpos(g.payload->'topic'->>'body', '](' || path || ')') > 0
      and public.in_featured_tree(g.deck_id)
  );
$$;
