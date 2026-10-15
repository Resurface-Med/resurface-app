-- Whether, after answering, a question shows every option or only the right
-- one and the one you picked (2026-10-15). It was reset on every question;
-- now it is remembered, and on the profile so it follows you between devices.
alter table public.profiles
  add column if not exists show_all_options boolean not null default false;
