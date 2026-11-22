-- The connector's admin policies run their checks once per query, not per row
-- (2026-11-22).
--
-- decks_admin_featured_mcp and questions_admin_featured_mcp (0083) called
-- mcp_request() and is_admin() bare, so Postgres ran both for every row it
-- looked at: about 18,700 question rows for an admin's list_decks, 400 ms on
-- a quiet database and a statement timeout on a busy one (Jacob, 02:05).
-- Wrapped in (select …) they become one-off init plans.
--
-- Also kept here: featured_bundle() reads one 14 MB row, which with Year 3
-- in it ran past anon's statement timeout and made /api/featured 504. It
-- gets its own 25 s; PostgREST honours a function's statement_timeout.

alter policy decks_admin_featured_mcp on public.decks
  using ((select public.mcp_request()) and (select public.is_admin()) and id in (select public.featured_deck_ids()))
  with check ((select public.mcp_request()) and (select public.is_admin())
              and (id in (select public.featured_deck_ids()) or parent_id in (select public.featured_deck_ids())));

alter policy questions_admin_featured_mcp on public.generated_questions
  using ((select public.mcp_request()) and (select public.is_admin()) and deck_id in (select public.featured_deck_ids()))
  with check ((select public.mcp_request()) and (select public.is_admin()) and deck_id in (select public.featured_deck_ids()));

alter function public.featured_bundle() set statement_timeout = '25s';
