-- The featured bundle, built once per change instead of once per request
-- (2026-11-10).
--
-- featured_bundle() assembled 8,300 questions on every call: 10 MB and 5.5 s.
-- The edge route asks for it as anon, whose statement_timeout is 3 s, so
-- every new version failed there (500) and every device then fell back to
-- building it itself as authenticated (8 s). With the database busy doing
-- that, ordinary loads queued behind it, ran past the app's 15 s limit and
-- were reported as "You're offline", which also hides Admin.
--
-- Now:
--   featured_bundle_store   one row: the last bundle built, and its version.
--   featured_bundle_refresh() builds it if featured_meta has moved on. Run
--                           every minute by pg_cron (no statement timeout),
--                           and straight after an admin edits a featured
--                           deck (featured_bundle_publish), so admins see
--                           their change at once.
--   featured_bundle()       returns the stored row: a read, not a build.
--   featured_version() and featured_mine() report the stored version, so a
--   device only ever asks for a version that exists, and the edge caches it.
--
-- Topic notes are also deduplicated properly. A note shared by a lecture's
-- questions was stored once per question with that question's line marked
-- in it (==…==); the marks made identical notes differ, doubling `topics`.
-- The app redraws the marks from payload.hl (focusNote), so where every hl
-- line is in the unmarked note the marks are dropped from the bundle.

create table if not exists public.featured_bundle_store (
  id smallint primary key default 1 check (id = 1),
  version bigint not null,
  body jsonb not null,
  built_at timestamptz not null default now()
);
alter table public.featured_bundle_store enable row level security;

create or replace function public.featured_bundle_build()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, f.byline, f.position, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5('featured-folder:' || lower(trim(f.folder)))::uuid end top
      from featured_decks f where f.listed
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.position, d.id root, d.owner_id from decks d join roots r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.position, t.root, c.owner_id from decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
  ),
  raw as (
    select g.id, g.deck_id, g.payload - 'topic' p, g.payload -> 'topic' topic, g.payload -> 'hl' hl
      from generated_questions g where g.deck_id in (select id from tree)
  ),
  q as (
    select id, deck_id, p,
           case when jsonb_typeof(hl) = 'array' and jsonb_array_length(hl) > 0
                 and topic ? 'body'
                 and not exists (select 1 from jsonb_array_elements_text(hl) h
                                  where position(h in replace(topic ->> 'body', '==', '')) = 0)
                then jsonb_set(topic, '{body}', to_jsonb(replace(topic ->> 'body', '==', '')))
                else topic end topic
      from raw
  ),
  topics as (
    select topic, (row_number() over (order by min(id)) - 1) idx from q where topic is not null group by topic
  )
  select jsonb_build_object(
    'version', (select version from featured_meta where id = 1),
    'roots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'top', r.top,
        'byline', coalesce(nullif(trim(r.byline), ''), nullif(trim(p.display_name), ''), 'Someone'),
        'position', r.position, 'shareCode', d.share_code
      ) order by r.position)
      from roots r join decks d on d.id = r.id left join profiles p on p.id = d.owner_id), '[]'::jsonb),
    'decks', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', r.top, 'name', r.folder, 'position', 0, 'root', r.id, 'parentId', null) x
          from roots r where r.folder is not null
        union all
        select jsonb_build_object(
          'id', t.id, 'name', coalesce(r.renames ->> t.id::text, t.name),
          'position', case when t.id = t.root then r.position else t.position end,
          'root', t.root,
          'parentId', case when t.id = t.root then (case when r.folder is null then null else r.top end) else t.parent_id end)
          from tree t join roots r on r.id = t.root
      ) s), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(topic order by idx) from topics), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'deckId', q.deck_id, 'payload', q.p)
             || case when t.idx is null then '{}'::jsonb else jsonb_build_object('t', t.idx) end)
      from q left join topics t on t.topic = q.topic), '[]'::jsonb)
  );
$$;

/* Builds the bundle if the content has moved on. One build at a time; a
   second caller gets the stored version back. The version stamped is the
   one read before building, so a change made during the build is picked up
   by the next run. */
create or replace function public.featured_bundle_refresh()
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare v bigint; s bigint;
begin
  select version into s from featured_bundle_store where id = 1;
  if not pg_try_advisory_xact_lock(hashtext('featured_bundle_refresh')) then return s; end if;
  select version into v from featured_meta where id = 1;
  if s is not distinct from v then return s; end if;
  insert into featured_bundle_store (id, version, body, built_at)
    values (1, v, jsonb_set(featured_bundle_build(), '{version}', to_jsonb(v)), now())
    on conflict (id) do update set version = excluded.version, body = excluded.body, built_at = excluded.built_at;
  return v;
end $$;

/* For admins, after editing a featured deck. */
create or replace function public.featured_bundle_publish()
returns bigint language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return public.featured_bundle_refresh();
end $$;

create or replace function public.featured_bundle()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b jsonb;
begin
  select body into b from featured_bundle_store where id = 1;
  if b is null then
    perform featured_bundle_refresh();
    select body into b from featured_bundle_store where id = 1;
  end if;
  return b;
end $$;

create or replace function public.featured_version()
returns bigint language sql stable security definer set search_path to 'public' as $$
  select coalesce((select version from featured_bundle_store where id = 1),
                  (select version from featured_meta where id = 1));
$$;

create or replace function public.featured_mine()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'version', public.featured_version(),
    'roots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.deck_id,
        'mine', d.owner_id = auth.uid(),
        'hidden', exists (select 1 from featured_hidden h where h.user_id = auth.uid() and h.deck_id = f.deck_id),
        'copyId', (select c.id from decks c where c.owner_id = auth.uid() and c.source_deck_id = f.deck_id order by c.created_at desc limit 1)
      ))
      from featured_decks f join decks d on d.id = f.deck_id
      where auth.uid() is not null and f.listed and (d.owner_id <> auth.uid() or f.owner_sees)), '[]'::jsonb),
    'extra', public.featured_extra()
  );
$$;

revoke all on function public.featured_bundle_build() from public, anon, authenticated;
revoke all on function public.featured_bundle_refresh() from public, anon, authenticated;
revoke all on function public.featured_bundle_publish() from public, anon;
grant execute on function public.featured_bundle_publish() to authenticated;
grant execute on function public.featured_version() to anon, authenticated;
grant execute on function public.featured_bundle() to anon, authenticated;
grant execute on function public.featured_mine() to authenticated;

select cron.unschedule('featured-bundle') where exists (select 1 from cron.job where jobname = 'featured-bundle');
select cron.schedule('featured-bundle', '* * * * *', 'select public.featured_bundle_refresh()');

select public.featured_bundle_refresh();

-- Admin overview: each table read once, by range, not four times by cast.
create index if not exists generated_questions_created on public.generated_questions (created_at);

create or replace function public.admin_overview()
returns table(sort integer, key text, today bigint, last7 bigint, prev7 bigint, total bigint)
language sql stable security definer set search_path to 'public' as $$
  with b as (select date_trunc('day', now()) d0, now() - interval '7 days' w1, now() - interval '14 days' w2),
  c as (
    select 1 s, 'accounts' k,
      count(*) filter (where email_confirmed_at >= b.d0),
      count(*) filter (where email_confirmed_at >= b.w1),
      count(*) filter (where email_confirmed_at >= b.w2 and email_confirmed_at < b.w1),
      count(*) filter (where email_confirmed_at is not null)
      from auth.users, b
    union all
    select 2, 'active',
      count(distinct user_id) filter (where day = current_date),
      count(distinct user_id) filter (where day > current_date - 7),
      count(distinct user_id) filter (where day > current_date - 14 and day <= current_date - 7),
      count(distinct user_id)
      from public.activity
    union all
    select 3, 'answers',
      coalesce(sum(count) filter (where day = current_date), 0),
      coalesce(sum(count) filter (where day > current_date - 7), 0),
      coalesce(sum(count) filter (where day > current_date - 14 and day <= current_date - 7), 0),
      coalesce(sum(count), 0)
      from public.activity
    union all
    select 4, 'generated',
      count(*) filter (where created_at >= b.d0),
      count(*) filter (where created_at >= b.w1),
      count(*) filter (where created_at >= b.w2 and created_at < b.w1),
      (select count(*) from public.generated_questions)
      from public.generated_questions, b where created_at >= b.w2
    union all
    select 5, 'flags',
      count(*) filter (where created_at >= b.d0),
      count(*) filter (where created_at >= b.w1),
      count(*) filter (where created_at >= b.w2 and created_at < b.w1),
      count(*)
      from public.question_flags, b
    union all
    select 6, 'decks',
      count(*) filter (where created_at >= b.d0),
      count(*) filter (where created_at >= b.w1),
      count(*) filter (where created_at >= b.w2 and created_at < b.w1),
      count(*)
      from public.decks, b
  )
  select * from c where public.is_admin() order by 1;
$$;
