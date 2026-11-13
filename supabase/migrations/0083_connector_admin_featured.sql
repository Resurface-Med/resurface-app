-- The Claude connector reaches every public deck for admins (2026-11-13).
--
-- The connector acts as the signed-in person, so RLS limited Jacob to the
-- decks he owns (Endocrine, Renal) and Rafil to his. Admins now get the whole
-- featured tree, but only on requests carrying the connector's x-mcp header:
-- the app's own queries (loadUserDecks selects decks unfiltered) never send
-- it, so nobody's deck list in the app changes. is_admin() is still required,
-- so the header alone grants nothing.

create or replace function public.mcp_request() returns boolean
language sql stable set search_path to 'public' as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-mcp', '') = '1'
$$;

-- Every deck inside a featured tree, as one set (hashed once per query,
-- not walked per row).
create or replace function public.featured_deck_ids() returns setof uuid
language sql stable security definer set search_path to 'public' as $$
  with recursive t as (
    select d.id from decks d join featured_decks f on f.deck_id = d.id
    union
    select c.id from decks c join t on c.parent_id = t.id
  ) select id from t
$$;
revoke all on function public.featured_deck_ids() from anon;

drop policy if exists decks_admin_featured_mcp on public.decks;
create policy decks_admin_featured_mcp on public.decks for all
  using (public.mcp_request() and public.is_admin() and id in (select public.featured_deck_ids()))
  with check (public.mcp_request() and public.is_admin()
              and (id in (select public.featured_deck_ids()) or parent_id in (select public.featured_deck_ids())));

drop policy if exists questions_admin_featured_mcp on public.generated_questions;
create policy questions_admin_featured_mcp on public.generated_questions for all
  using (public.mcp_request() and public.is_admin() and deck_id in (select public.featured_deck_ids()))
  with check (public.mcp_request() and public.is_admin() and deck_id in (select public.featured_deck_ids()));

-- Counts and search follow RLS rather than "mine", so they cover the same decks.
create or replace function public.my_deck_counts()
returns table(deck_id uuid, questions integer) language sql stable set search_path to 'public' as $$
  select g.deck_id, count(*)::int from generated_questions g group by g.deck_id
$$;

create or replace function public.my_question_search(q text, within uuid default null, lim integer default 30)
returns table(id bigint, deck_id uuid, payload jsonb) language sql stable set search_path to 'public' as $$
  with recursive t as (
    select d.id from decks d where d.id = within
    union all
    select d.id from decks d join t on d.parent_id = t.id
  )
  select g.id, g.deck_id, g.payload
    from generated_questions g
   where (within is null or g.deck_id in (select t.id from t))
     and (g.payload->>'q' ilike '%' || q || '%'
       or g.payload->>'exp' ilike '%' || q || '%'
       or (g.payload->'opts')::text ilike '%' || q || '%'
       or g.payload->'topic'->>'title' ilike '%' || q || '%')
   order by g.id
   limit least(greatest(coalesce(lim, 30), 1), 100)
$$;

create or replace function public.my_hardest_questions(root uuid, min_attempts integer default 5, lim integer default 30)
returns table(id bigint, attempts integer, correct integer, people integer)
language sql stable security definer set search_path to 'public' as $$
  with recursive tree as (
    select d.id from decks d where d.id = root
      and (d.owner_id = auth.uid() or (public.is_admin() and d.id in (select public.featured_deck_ids())))
    union all
    select d.id from decks d join tree t on d.parent_id = t.id
  )
  select g.id, sum(s.total)::int, sum(s.correct)::int, count(distinct s.user_id)::int
  from generated_questions g
  join tree t on t.id = g.deck_id
  join practice_stats s on s.question_id = 1000000 + g.id
  group by g.id
  having sum(s.total) >= greatest(1, coalesce(min_attempts, 5))
  order by sum(s.correct)::float / sum(s.total), sum(s.total) desc
  limit greatest(1, least(coalesce(lim, 30), 100));
$$;

-- Undo follows whoever made the change, not who owns the question.
alter table public.question_history add column if not exists actor_id uuid;

create or replace function public.tg_question_history() returns trigger
language plpgsql security definer set search_path to 'public' as $$
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
  insert into question_history (batch, tool, action, question_id, user_id, deck_id, payload, actor_id)
  values (b::uuid, h ->> 'x-mcp-tool', case tg_op when 'DELETE' then 'delete' else 'edit' end,
          old.id, old.user_id, old.deck_id, old.payload, auth.uid());
  if random() < 0.02 then
    delete from question_history where created_at < now() - interval '30 days';
  end if;
  return coalesce(new, old);
end $$;

drop policy if exists "own history" on public.question_history;
create policy "own history" on public.question_history for select
  using ((select auth.uid()) = coalesce(actor_id, user_id));

create or replace function public.my_history(lim integer default 20)
returns table(batch uuid, tool text, at timestamptz, edited integer, deleted integer, sample text)
language sql stable set search_path to 'public' as $$
  select h.batch, max(h.tool), max(h.created_at),
         count(*) filter (where h.action = 'edit')::int,
         count(*) filter (where h.action = 'delete')::int,
         left(min(h.payload ->> 'q'), 120)
  from question_history h
  where coalesce(h.actor_id, h.user_id) = auth.uid() and h.created_at > now() - interval '30 days'
  group by h.batch
  order by max(h.created_at) desc
  limit greatest(1, least(coalesce(lim, 20), 100));
$$;

create or replace function public.my_undo(b uuid)
returns table(restored integer, recreated integer)
language plpgsql security definer set search_path to 'public' as $$
declare r int := 0; c int := 0;
begin
  perform set_config('app.no_history', '1', true);
  with first as (
    select distinct on (question_id) * from question_history
    where batch = b and coalesce(actor_id, user_id) = auth.uid() order by question_id, id
  ), upd as (
    update generated_questions g set payload = f.payload, deck_id = f.deck_id
    from first f where g.id = f.question_id
      and (g.user_id = auth.uid() or (public.is_admin() and g.deck_id in (select public.featured_deck_ids())))
    returning g.id
  )
  select count(*) into r from upd;
  with first as (
    select distinct on (question_id) * from question_history
    where batch = b and coalesce(actor_id, user_id) = auth.uid() order by question_id, id
  ), ins as (
    insert into generated_questions (id, user_id, deck_id, payload)
    overriding system value
    select f.question_id, f.user_id, f.deck_id, f.payload from first f
    where not exists (select 1 from generated_questions g where g.id = f.question_id)
      and exists (select 1 from decks d where d.id = f.deck_id
                  and (d.owner_id = auth.uid() or (public.is_admin() and d.id in (select public.featured_deck_ids()))))
    returning id
  )
  select count(*) into c from ins;
  if r + c = 0 then raise exception 'Nothing to undo for that change.'; end if;
  delete from question_history where batch = b and coalesce(actor_id, user_id) = auth.uid();
  return query select r, c;
end $$;
