-- Ready-made question images readable without signing in (2026-11-22), so
-- /api/qimg can fetch each one once and serve it from Vercel's edge cache.
--
-- Supabase egress went past the free plan's 5 GB in the first 12 days of
-- the cycle: every device kept every ready-made image, through signed links
-- that changed hourly and could not be cached, and Year 3 added 859 of them
-- (about 50 MB a student). Only images in a featured deck pass this, the
-- same images the public bundle already lists; anyone's own images stay
-- behind signed links for their owner.
create policy "question images on featured decks: the edge reads them"
  on storage.objects for select to anon
  using (bucket_id = 'question-images' and public.question_image_is_featured(name));
