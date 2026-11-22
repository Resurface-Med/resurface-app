-- Speed pass (2026-11-22), from pg_stat_statements and the advisors.

-- 1. Your own questions, in pages. loadAll asks for them by user ordered by
-- id, 1,000 at a time; with only (user_id, created_at) every page read all
-- of that person's questions and sorted them on disk (880 ms for 2,107).
-- It was the most expensive query in the database: 23,900 calls at 656 ms.
create index if not exists generated_questions_user_id on public.generated_questions (user_id, id);

-- 2. Which questions use which image. Every featured image a student opened
-- ran question_image_is_featured, which read every question's payload and
-- searched its topic note and explanation for the path: 176 ms a picture,
-- 23,700 calls, growing with the bank. Now one index lookup.
create table if not exists public.question_image_refs (
  path text not null,
  question_id bigint not null references public.generated_questions(id) on delete cascade,
  primary key (path, question_id)
);
create index if not exists question_image_refs_question on public.question_image_refs (question_id);
alter table public.question_image_refs enable row level security;
revoke all on public.question_image_refs from anon, authenticated;

/* The image paths a question uses: its picture, and ](path) links in its
   topic note and explanation — what question_image_is_featured searched. */
create or replace function public.question_image_paths(p jsonb)
returns setof text language sql immutable set search_path to 'public' as $$
  select p->>'img' where nullif(p->>'img', '') is not null
  union
  select m[1] from regexp_matches(coalesce(p->'topic'->>'body', ''), '\]\(([^)\s]+)\)', 'g') m
  union
  select m[1] from regexp_matches(coalesce(p->>'exp', ''), '\]\(([^)\s]+)\)', 'g') m
$$;

create or replace function public.tg_question_image_refs()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' then
    if new.payload is not distinct from old.payload then return null; end if;
    delete from question_image_refs where question_id = old.id;
  end if;
  insert into question_image_refs (path, question_id)
    select distinct x, new.id from question_image_paths(new.payload) x
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists question_image_refs on public.generated_questions;
create trigger question_image_refs after insert or update of payload on public.generated_questions
  for each row execute function public.tg_question_image_refs();

insert into public.question_image_refs (path, question_id)
  select distinct x, g.id from public.generated_questions g cross join lateral public.question_image_paths(g.payload) x
on conflict do nothing;

create or replace function public.question_image_is_featured(path text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.question_image_refs r
      join public.generated_questions g on g.id = r.question_id
     where r.path = $1 and public.in_featured_tree(g.deck_id)
  );
$$;

-- 3. Policies that called auth.uid() for every row (advisor auth_rls_initplan).
alter policy "insert own load timing" on public.load_timings with check (user_id = (select auth.uid()));
alter policy "own sessions: add" on public.practice_sessions with check (user_id = (select auth.uid()));
alter policy "own sessions: change" on public.practice_sessions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own sessions: read" on public.practice_sessions using (user_id = (select auth.uid()));
alter policy "own sessions: remove" on public.practice_sessions using (user_id = (select auth.uid()));
alter policy "own push subscriptions, add" on public.push_subscriptions with check (user_id = (select auth.uid()));
alter policy "own push subscriptions, change" on public.push_subscriptions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own push subscriptions, read" on public.push_subscriptions using (user_id = (select auth.uid()));
alter policy "own push subscriptions, remove" on public.push_subscriptions using (user_id = (select auth.uid()));
alter policy "own notes: delete" on public.question_notes using (user_id = (select auth.uid()));
alter policy "own notes: insert" on public.question_notes with check (user_id = (select auth.uid()));
alter policy "own notes: read" on public.question_notes using (user_id = (select auth.uid()));
alter policy "own notes: update" on public.question_notes using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 4. Foreign keys with no index (advisor unindexed_foreign_keys). The one
-- that matters: deleting any question set source_question_id to null by
-- scanning every question, so a big delete (a deck of 4,500) was slow
-- enough to time out.
create index if not exists generated_questions_source on public.generated_questions (source_question_id) where source_question_id is not null;
create index if not exists decks_source on public.decks (source_deck_id) where source_deck_id is not null;
create index if not exists announcements_author on public.announcements (author);
create index if not exists deck_suggestions_author on public.deck_suggestions (author);
create index if not exists featured_audience_user on public.featured_audience (user_id);
create index if not exists featured_hidden_deck on public.featured_hidden (deck_id);
create index if not exists load_timings_user on public.load_timings (user_id);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists question_review_comments_author on public.question_review_comments (author);
create index if not exists question_reviews_reviewer on public.question_reviews (reviewer);
create index if not exists suggestion_outcomes_decided_by on public.suggestion_outcomes (decided_by);

-- 5. Not callable without signing in. admin_flags and admin_generated_daily
-- already return nothing to anyone but an admin; trigger functions cannot
-- be called directly. Tidying the advisor's list, not closing a hole.
revoke execute on function public.admin_flags() from anon;
revoke execute on function public.admin_generated_daily(integer) from anon;
revoke execute on function public.check_deck_parent() from anon;
revoke execute on function public.own_edit_to_source() from anon;
revoke execute on function public.rescue_foreign_children() from anon;
revoke execute on function public.tg_featured_byline() from anon;
revoke execute on function public.tg_featured_deck_rows() from anon;
revoke execute on function public.tg_featured_decks() from anon;
revoke execute on function public.tg_featured_questions() from anon;
revoke execute on function public.tg_question_image_refs() from anon;
