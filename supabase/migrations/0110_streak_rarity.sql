-- The flames popup says how rare a streak is (2026-11-25): the share of
-- everyone who has ever kept a streak whose best reached n days. One
-- number, nobody's data.
create or replace function public.streak_rarity(n int)
returns numeric
language sql stable security definer set search_path = public
as $$
  select round(100.0 * count(*) filter (where longest >= n) / nullif(count(*), 0), 1)
  from public.streaks where longest >= 1
$$;
revoke all on function public.streak_rarity(int) from public, anon;
grant execute on function public.streak_rarity(int) to authenticated;
