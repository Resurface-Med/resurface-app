-- Your own recent answers, for the "you're getting better" card (2026-10-26):
-- each answer's question, right or wrong, and when, for the last 90 days
-- at most. Only ever your own rows.
create or replace function public.my_recent_answers(days integer default 90)
returns table(question_id integer, correct boolean, at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.question_id, a.correct, a.at
  from public.answer_log a
  where a.user_id = auth.uid()
    and a.at > now() - make_interval(days => least(greatest(days, 1), 90))
  order by a.at
$$;
revoke all on function public.my_recent_answers(integer) from public, anon;
grant execute on function public.my_recent_answers(integer) to authenticated;
