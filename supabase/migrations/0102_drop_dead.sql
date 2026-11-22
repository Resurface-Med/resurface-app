-- Dead weight out of the database (2026-11-22).
--
-- Each of these was checked against everything that can reach the
-- database: the app, the backend, the landing page, every trigger, policy
-- and cron job, and every function those call. Nothing reaches them.
--
-- Functions: bank_load and bank_apply (the October Year 1 loader, before
-- admin upload and the connector), featured_bundle_build (replaced by the
-- shards, 0095), admin_ai_calls_daily and admin_remove_avatar (their
-- Admin controls went on 19 and 18 Oct), tmp_next (already broken: its
-- tmp_reviewed table is gone), tmp_image_featured_old (a comparison copy
-- from 0097), and the tools schema's dump and apply_notes, one-off editing
-- helpers.
--
-- Tables: bank_loader (the old loader's sign-in tokens), and the staging
-- and before-copies from question passes. Their rows are kept outside the
-- database, in ~/resurface/db-archive-2026-11-22/ on Rafil's machine,
-- with the three functions no migration holds. question_payload_backup
-- stays: it is where the passes' originals are looked up.

drop function if exists public.bank_load(uuid, jsonb, text);
drop function if exists public.bank_apply(uuid, jsonb, jsonb);
drop function if exists public.featured_bundle_build();
drop function if exists public.admin_ai_calls_daily(integer);
drop function if exists public.admin_remove_avatar(uuid);
drop function if exists public.tmp_next(integer);
drop function if exists public.tmp_image_featured_old(text);
drop function if exists tools.dump(uuid);
drop function if exists tools.apply_notes(uuid, uuid, jsonb, jsonb);
drop schema if exists tools;

drop table if exists public.bank_loader;
drop table if exists public.tmp_dec_stage;
drop table if exists public.tmp_dist2_stage;
drop table if exists public.tmp_optexp_stage;
drop table if exists public.tmp_featured_meta_backup;
drop table if exists public.tmp_img_cmp;
drop table if exists public.tmp_y3_lecture_pass_backup;
drop table if exists public.tmp_y3_lecture_pass_deleted;
drop table if exists public.tmp_y3_release_backup;
drop table if exists public.tmp_y3_usefulness_backup;
