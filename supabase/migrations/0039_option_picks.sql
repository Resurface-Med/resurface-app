-- Which option someone chose, the first time they answered.
--
-- practice_stats only knows right or wrong. A peer split needs the option,
-- and it has to be the option's own index: the letters are shuffled, so
-- "C" is not the same choice for two people.
--
-- One row per person per question, and the first answer sticks. A later
-- attempt, after they've seen the explanation, would pile onto the right
-- option and the split would stop meaning "what people chose".
--
-- option_split hands back the counts only once 20 distinct people have
-- answered. Below that the app shows a stand-in (src/lib/peerSplit.js,
-- PEER_MIN) and a thin sample never leaves the database. Keep the 20 in
-- step with that constant.

create table public.option_picks (
  user_id      uuid not null references auth.users(id) on delete cascade,
  question_id  integer not null,
  option_index smallint not null check (option_index >= 0 and option_index < 12),
  created_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index option_picks_question_idx on public.option_picks (question_id);

alter table public.option_picks enable row level security;

create policy "own option picks" on public.option_picks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function public.option_split(qid integer)
returns table(option_index integer, n integer)
language sql stable security definer set search_path = public as $$
  with picks as (
    select p.option_index
    from public.option_picks p
    where p.question_id = qid
      and auth.uid() is not null
  )
  select picks.option_index, count(*)::integer
  from picks
  where (select count(*) from picks) >= 20
  group by picks.option_index
$$;

revoke all on function public.option_split(integer) from public;
grant execute on function public.option_split(integer) to authenticated;
