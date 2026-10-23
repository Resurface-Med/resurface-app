-- Question review for the admin team (2026-10-23): Rafil, Jacob and Rayan
-- go through a deck question by question, approve or flag each, and talk
-- about it in a comment thread. A Resurface deck can only be published once
-- every question in it is approved.
--
-- Keyed on generated_questions.id (the database id, not the app's
-- GEN_ID_BASE one). Both tables have RLS on and no policies: they are read
-- and written only through the SECURITY DEFINER functions below, each of
-- which checks is_admin() itself.

create table if not exists public.question_reviews (
  question_id bigint primary key references public.generated_questions (id) on delete cascade,
  status text not null check (status in ('approved', 'flagged')),
  reviewer uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.question_reviews enable row level security;

create table if not exists public.question_review_comments (
  id bigint generated always as identity primary key,
  question_id bigint not null references public.generated_questions (id) on delete cascade,
  author uuid references auth.users (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.question_review_comments enable row level security;
create index if not exists question_review_comments_q on public.question_review_comments (question_id, created_at);

/* Status and thread for a set of questions, with names. */
create or replace function public.admin_review_state(qids bigint[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.is_admin() then '{"reviews":[],"comments":[]}'::jsonb else jsonb_build_object(
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('qid', r.question_id, 'status', r.status, 'by', r.reviewer,
               'name', coalesce(nullif(btrim(p.display_name), ''), 'Someone'), 'at', r.updated_at))
        from question_reviews r left join profiles p on p.id = r.reviewer
       where r.question_id = any (qids)), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'qid', c.question_id, 'by', c.author,
               'name', coalesce(nullif(btrim(p.display_name), ''), 'Someone'), 'body', c.body, 'at', c.created_at)
               order by c.created_at)
        from question_review_comments c left join profiles p on p.id = c.author
       where c.question_id = any (qids)), '[]'::jsonb)
  ) end;
$$;

/* Approve, flag, or (null) clear a question's status. */
create or replace function public.admin_review_set(qid bigint, new_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if new_status is null then
    delete from question_reviews where question_id = qid;
  else
    insert into question_reviews (question_id, status, reviewer, updated_at)
    values (qid, new_status, auth.uid(), now())
    on conflict (question_id) do update set status = excluded.status, reviewer = excluded.reviewer, updated_at = now();
  end if;
end $$;

create or replace function public.admin_review_comment(qid bigint, body text)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare new_id bigint;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into question_review_comments (question_id, author, body) values (qid, auth.uid(), btrim(body))
  returning id into new_id;
  return new_id;
end $$;

/* Only your own comment. */
create or replace function public.admin_review_uncomment(cid bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from question_review_comments where id = cid and author = auth.uid();
end $$;

/* Publishing a Resurface deck needs every question in it approved. */
create or replace function public.admin_publish_featured(deck uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare waiting int;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  with recursive t as (select deck as id union all select d.id from decks d join t on d.parent_id = t.id)
  select count(*) into waiting from generated_questions g
   where g.deck_id in (select id from t)
     and not exists (select 1 from question_reviews r where r.question_id = g.id and r.status = 'approved');
  if waiting > 0 then
    raise exception '% questions in this deck are not approved yet', waiting;
  end if;
  update featured_decks set listed = true where deck_id = deck;
end $$;

revoke all on function public.admin_review_state(bigint[]) from public, anon;
revoke all on function public.admin_review_set(bigint, text) from public, anon;
revoke all on function public.admin_review_comment(bigint, text) from public, anon;
revoke all on function public.admin_review_uncomment(bigint) from public, anon;
grant execute on function public.admin_review_state(bigint[]) to authenticated;
grant execute on function public.admin_review_set(bigint, text) to authenticated;
grant execute on function public.admin_review_comment(bigint, text) to authenticated;
grant execute on function public.admin_review_uncomment(bigint) to authenticated;

-- Year 1 Principles, so Jacob and Rayan can review it: a Resurface deck in a
-- "Year 1" folder, unlisted, shown only to them (Rafil owns it, so sees it
-- as his own). Published later, once approved, from Admin.
do $$
declare
  p uuid;
begin
  select id into p from decks
   where owner_id = '0b920395-b28e-442e-a68b-28e0b7d0a06b' and parent_id is null and name = 'Principles' and source_deck_id is null;
  if p is null then raise exception 'no Principles deck'; end if;
  insert into featured_decks (deck_id, folder, listed, position)
  values (p, 'Year 1', false, coalesce((select max(position) + 1 from featured_decks), 0))
  on conflict (deck_id) do update set folder = 'Year 1', listed = false;
  insert into featured_audience (deck_id, user_id) values
    (p, '9a8e8256-04bb-4709-b506-2d74c9a0329d'),
    (p, 'd948687b-d205-477f-bb94-1c84dab338c1')
  on conflict do nothing;
end $$;
