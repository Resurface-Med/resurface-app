-- Exam mode for results tables was taken out (Rafil, 2026-10-20: the exams
-- do give normal ranges), so its column from 0034 goes.

alter table public.profiles drop column if exists hide_ranges;
