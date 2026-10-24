-- Real per-option percentages, shown once 10 people have answered.
--
-- A pick is now the option's text, not its index. Options are shuffled per
-- person and re-alphabetised whenever a question is fixed, so an index from
-- last week can point at a different option today. Text survives both, and a
-- pick for an option that has since been reworded or swapped out simply stops
-- counting, rather than being credited to whatever now sits in its slot.
--
-- option_split only counts picks that match one of the question's current
-- options, and returns nothing until 10 distinct people are in that count.
-- Below that the app shows no numbers at all. Keep the 10 in step with
-- PEER_MIN in src/lib/peerSplit.js.

alter table public.option_picks add column if not exists option_text text;
alter table public.option_picks alter column option_index drop not null;

drop function if exists public.option_split(integer);
create function public.option_split(qid integer)
returns table(option_text text, n integer)
language sql stable security definer set search_path = public as $$
  with q as (
    select g.payload->'opts' as opts
    from public.generated_questions g
    where g.id = qid - 1000000
  ),
  picks as (
    select p.option_text
    from public.option_picks p, q
    where p.question_id = qid
      and p.option_text is not null
      and q.opts ? p.option_text
      and auth.uid() is not null
  )
  select picks.option_text, count(*)::integer
  from picks
  where (select count(*) from picks) >= 10
  group by picks.option_text
$$;

revoke all on function public.option_split(integer) from public;
grant execute on function public.option_split(integer) to authenticated;
