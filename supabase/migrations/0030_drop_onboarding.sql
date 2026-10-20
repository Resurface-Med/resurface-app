-- Onboarding was taken out (Rafil, 2026-10-20), so the profile columns
-- 0029 added for it go too.

alter table public.profiles
  drop column if exists study_year,
  drop column if exists university,
  drop column if exists onboarded_at;
