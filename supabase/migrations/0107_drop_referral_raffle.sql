-- Drop Christmas referral raffle (0106). Campaign cancelled; no UI left.

drop trigger if exists referral_qualify on public.answer_log;

drop function if exists public.tg_referral_qualify();
drop function if exists public.admin_referral_draw();
drop function if exists public.admin_referral_board();
drop function if exists public.my_referral_stats();
drop function if exists public.claim_referral(text);
drop function if exists public.my_referral_code();
drop function if exists public.referral_campaign_live();

drop table if exists public.referrals;
drop table if exists public.referral_codes;
drop table if exists public.referral_campaign;
