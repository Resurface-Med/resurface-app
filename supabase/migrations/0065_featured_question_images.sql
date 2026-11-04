-- Pictures on Resurface decks are seen by everyone (2026-11-04).
--
-- question-images is private: only the uploader can read their files, which
-- is right for a student's own decks. But an admin's picture on a question in
-- a featured tree (Jacob's Year 2 Renal, 2 Nov) drew a grey box for every
-- other student. A file is now readable by any signed-in person when a
-- question in a featured tree uses it; everything else stays owner-only.
--
-- The check runs as definer: the questions belong to the deck owner, so the
-- reader's own row-level security would hide them.

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
  );
$$;

revoke all on function public.question_image_is_featured(text) from public;
grant execute on function public.question_image_is_featured(text) to authenticated;

create index if not exists generated_questions_img_idx
  on public.generated_questions ((payload->>'img'))
  where payload->>'img' is not null;

create policy "question images on featured decks are readable by everyone"
  on storage.objects for select to authenticated
  using (bucket_id = 'question-images' and public.question_image_is_featured(name));
