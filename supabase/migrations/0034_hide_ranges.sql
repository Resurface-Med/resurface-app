-- Exam mode for data exhibits (2026-10-20): hide the normal-range column,
-- as the UKMLA does — candidates look ranges up on a separate sheet (here,
-- the lab values panel). A preference on the profile, like show_all_options.

alter table public.profiles add column if not exists hide_ranges boolean not null default false;
