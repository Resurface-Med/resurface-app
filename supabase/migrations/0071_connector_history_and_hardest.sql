-- Claude connector, part two (2026-11-06): undo, and which questions
-- students find hardest.
--
-- Undo. Every change the connector makes to a question (edit, move, delete)
-- first copies the question as it was into question_history, tagged with one
-- id per connector call, so a whole call can be put back. Only connector
-- calls are recorded: the connector sends an x-mcp-batch header and the
-- trigger reads it from PostgREST's request.headers, so the app's own edits
-- (and every student) write nothing here. Kept 30 days.

create table if not exists public.question_history (
  id bigint generated always as identity primary key,
  batch uuid not null,
  tool text,
  action text not null check (action in ('edit', 'delete')),
  question_id bigint not null,
  user_id uuid not null,
  deck_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists question_history_user_time on public.question_history (user_id, created_at desc);
create index if not exists question_history_batch on public.question_history (batch);

alter table public.question_history enable row level security;
drop policy if exists "own history" on public.question_history;
create policy "own history" on public.question_history for select using ((select auth.uid()) = user_id);
-- No insert/update/delete policies: only the trigger and my_undo write.

create or replace function public.tg_question_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  h json := nullif(current_setting('request.headers', true), '')::json;
  b text := h ->> 'x-mcp-batch';
begin
  if b is null or coalesce(current_setting('app.no_history', true), '') = '1' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.payload is not distinct from old.payload and new.deck_id is not distinct from old.deck_id then
    return new;
  end if;
  insert into question_history (batch, tool, action, question_id, user_id, deck_id, payload)
  values (b::uuid, h ->> 'x-mcp-tool', case tg_op when 'DELETE' then 'delete' else 'edit' end,
          old.id, old.user_id, old.deck_id, old.payload);
  if random() < 0.02 then
    delete from question_history where created_at < now() - interval '30 days';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists question_history on public.generated_questions;
create trigger question_history before update or delete on public.generated_questions
  for each row execute function public.tg_question_history();

-- The person's recent connector calls that changed questions, newest first.
create or replace function public.my_history(lim int default 20)
returns table (batch uuid, tool text, at timestamptz, edited int, deleted int, sample text)
language sql stable security invoker set search_path = public as $$
  select h.batch, max(h.tool), max(h.created_at),
         count(*) filter (where h.action = 'edit')::int,
         count(*) filter (where h.action = 'delete')::int,
         left(min(h.payload ->> 'q'), 120)
  from question_history h
  where h.user_id = auth.uid() and h.created_at > now() - interval '30 days'
  group by h.batch
  order by max(h.created_at) desc
  limit greatest(1, least(coalesce(lim, 20), 100));
$$;

-- Puts back every question one connector call changed, as it was before.
-- Security definer so it can clear the history it used; every statement is
-- limited to the caller's own rows and decks.
-- Deleted questions come back with their old ids; progress students had on
-- them was deleted with them and does not come back.
create or replace function public.my_undo(b uuid)
returns table (restored int, recreated int)
language plpgsql security definer set search_path = public as $$
declare r int := 0; c int := 0;
begin
  perform set_config('app.no_history', '1', true);
  with first as (
    select distinct on (question_id) * from question_history
    where batch = b and user_id = auth.uid() order by question_id, id
  ), upd as (
    update generated_questions g set payload = f.payload, deck_id = f.deck_id
    from first f where g.id = f.question_id and g.user_id = auth.uid()
    returning g.id
  )
  select count(*) into r from upd;
  with first as (
    select distinct on (question_id) * from question_history
    where batch = b and user_id = auth.uid() order by question_id, id
  ), ins as (
    insert into generated_questions (id, user_id, deck_id, payload)
    overriding system value
    select f.question_id, f.user_id, f.deck_id, f.payload from first f
    where not exists (select 1 from generated_questions g where g.id = f.question_id)
      and exists (select 1 from decks d where d.id = f.deck_id and d.owner_id = auth.uid())
    returning id
  )
  select count(*) into c from ins;
  if r + c = 0 then raise exception 'Nothing to undo for that change.'; end if;
  delete from question_history where batch = b and user_id = auth.uid();
  return query select r, c;
end $$;

-- Hardest questions. Students answer the owner's questions in a public deck
-- under the app id 1,000,000 + the question's id (GEN_ID_BASE), so their
-- answers can be added up per question. Only totals leave this function,
-- never who answered, and only for the caller's own decks.
create index if not exists practice_stats_question on public.practice_stats (question_id);

create or replace function public.my_hardest_questions(root uuid, min_attempts int default 5, lim int default 30)
returns table (id bigint, attempts int, correct int, people int)
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select d.id from decks d where d.id = root and d.owner_id = auth.uid()
    union all
    select d.id from decks d join tree t on d.parent_id = t.id where d.owner_id = auth.uid()
  )
  select g.id, sum(s.total)::int, sum(s.correct)::int, count(distinct s.user_id)::int
  from generated_questions g
  join tree t on t.id = g.deck_id
  join practice_stats s on s.question_id = 1000000 + g.id
  where g.user_id = auth.uid()
  group by g.id
  having sum(s.total) >= greatest(1, coalesce(min_attempts, 5))
  order by sum(s.correct)::float / sum(s.total), sum(s.total) desc
  limit greatest(1, least(coalesce(lim, 30), 100));
$$;

revoke all on function public.my_history(int), public.my_undo(uuid), public.my_hardest_questions(uuid, int, int) from public, anon;
grant execute on function public.my_history(int), public.my_undo(uuid), public.my_hardest_questions(uuid, int, int) to authenticated;
revoke all on function public.tg_question_history() from public, anon, authenticated;
