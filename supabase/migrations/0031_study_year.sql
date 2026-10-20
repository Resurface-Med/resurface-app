-- Year of study (2026-10-20): asked as a dropdown in the first pop-up after
-- sign-up, and once of everyone who signed up before. For year-locked decks
-- and the like later.
--
--   study_year   1–5; 0 is "something else" or skipped; null, not asked yet.

alter table public.profiles
  add column if not exists study_year smallint check (study_year between 0 and 5);
