-- Onboarding (2026-10-20): after a first sign-up, a short flow asks for a
-- name, the year of study and the university; existing accounts are asked
-- the year once. Kept on the profile for year-locked decks and the like.
--
--   study_year     1–5; 0 is "something else" (or skipped); null, not asked.
--   university     free text: "Anglia Ruskin University" or what they typed.
--   onboarded_at   when the flow was finished. Null only for accounts made
--                  after this migration that have not been through it — so
--                  everyone here already is marked, and gets the one-question
--                  year card instead.

alter table public.profiles
  add column if not exists study_year smallint check (study_year between 0 and 5),
  add column if not exists university text check (university is null or length(university) <= 120),
  add column if not exists onboarded_at timestamptz;

update public.profiles set onboarded_at = coalesce(created_at, now()) where onboarded_at is null;
