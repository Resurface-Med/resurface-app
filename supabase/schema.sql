-- Resurface — complete database schema, read out of the live project.
--
-- Why this file exists: 25 migrations have been applied to the project, four
-- of which are in supabase/migrations/. The rest were applied directly and
-- exist only inside Supabase, which also holds the migration history, so
-- losing the project would lose both the database and the record of how to
-- rebuild it. This is the record. It is a snapshot, not a migration: running
-- it on an empty project reproduces the schema as it stood when it was taken.
--
-- Taken 2026-10-05 from project uhqpljteohitvytwfadp.
-- Regenerate by reading pg_catalog, not by hand.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid not null,
  display_name text,
  daily_goal integer not null default 20,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  show_on_leaderboard boolean not null default true,
  marketing_opt_in boolean,
  name_chosen boolean not null default false
);

create table if not exists public.practice_stats (
  user_id uuid not null,
  question_id integer not null,
  correct integer not null default 0,
  total integer not null default 0,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.sr_cards (
  user_id uuid not null,
  question_id integer not null,
  "interval" integer not null default 0,
  repetitions integer not null default 0,
  ease_factor numeric(4,2) not null default 2.5,
  lapses integer not null default 0,
  due_date timestamp with time zone,
  interval_minutes integer,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.bookmarks (
  user_id uuid not null,
  question_id integer not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.activity (
  user_id uuid not null,
  day date not null,
  count integer not null default 0
);

create table if not exists public.streaks (
  user_id uuid not null,
  current integer not null default 0,
  longest integer not null default 0,
  last_date date,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.question_edits (
  user_id uuid not null,
  question_id integer not null,
  payload jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.question_flags (
  user_id uuid not null,
  question_id integer not null,
  reason text not null,
  note text,
  created_at timestamp with time zone not null default now()
);

-- is_folder is the whole deck model: false holds questions, true holds decks
-- and folders. The triggers below keep the two from blurring back together.
create table if not exists public.decks (
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  parent_id uuid,
  name text not null,
  is_folder boolean not null default false,
  "position" integer not null default 0,
  share_code text not null default encode(gen_random_bytes(6), 'hex'::text),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.generated_questions (
  id bigint not null,
  user_id uuid not null,
  payload jsonb not null,
  created_at timestamp with time zone not null default now(),
  deck_id uuid
);

create table if not exists public.ai_usage (
  id bigint not null,
  user_id uuid,
  kind text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  raw jsonb,
  created_at timestamp with time zone not null default now()
);

-- Where the keepalive cron records that it ran. RLS on and no policies, like
-- admins: reachable only through keepalive_ping() and admin_heartbeats().
-- Exists because the cron can fail silently — a 401 every morning breaks
-- nothing visible and the Supabase pause still arrives a week later — and
-- Hobby drops runtime logs after an hour, five hours before anyone is awake
-- to read the 06:00 run.
create table if not exists public.ops_heartbeat (
  name    text primary key,
  last_ok timestamptz not null default now(),
  detail  jsonb
);

-- Admin is a table, not a claim or a client-side flag. RLS is on and it has
-- no policies at all, so it is unreadable and unwritable over the API; only
-- the SECURITY DEFINER functions below can see it.
create table if not exists public.admins (
  user_id uuid not null,
  added_at timestamp with time zone not null default now()
);

-- ----------------------------------------------------------- constraints

alter table public.profiles add constraint profiles_pkey primary key (id);
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.profiles add constraint profiles_daily_goal_check check (daily_goal >= 1 and daily_goal <= 500);

alter table public.practice_stats add constraint practice_stats_pkey primary key (user_id, question_id);
alter table public.practice_stats add constraint practice_stats_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
-- you cannot have been right more often than you answered
alter table public.practice_stats add constraint practice_stats_check check (total >= correct);
alter table public.practice_stats add constraint practice_stats_correct_check check (correct >= 0);

alter table public.sr_cards add constraint sr_cards_pkey primary key (user_id, question_id);
alter table public.sr_cards add constraint sr_cards_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.bookmarks add constraint bookmarks_pkey primary key (user_id, question_id);
alter table public.bookmarks add constraint bookmarks_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.activity add constraint activity_pkey primary key (user_id, day);
alter table public.activity add constraint activity_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.activity add constraint activity_count_check check (count >= 0);

alter table public.streaks add constraint streaks_pkey primary key (user_id);
alter table public.streaks add constraint streaks_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.question_edits add constraint question_edits_pkey primary key (user_id, question_id);
alter table public.question_edits add constraint question_edits_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.question_flags add constraint question_flags_pkey primary key (user_id, question_id);
alter table public.question_flags add constraint question_flags_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.question_flags add constraint question_flags_note_check check (note is null or char_length(note) <= 500);
alter table public.question_flags add constraint question_flags_reason_check check (reason = any (array['wrong-answer','bad-explanation','unclear','duplicate','other']));

alter table public.decks add constraint decks_pkey primary key (id);
alter table public.decks add constraint decks_share_code_key unique (share_code);
alter table public.decks add constraint decks_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
alter table public.decks add constraint decks_parent_id_fkey foreign key (parent_id) references public.decks(id) on delete cascade;
alter table public.decks add constraint decks_name_check check (char_length(name) >= 1 and char_length(name) <= 80);

alter table public.generated_questions add constraint generated_questions_pkey primary key (id);
alter table public.generated_questions add constraint generated_questions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.generated_questions add constraint generated_questions_deck_id_fkey foreign key (deck_id) references public.decks(id) on delete cascade;

alter table public.ai_usage add constraint ai_usage_pkey primary key (id);
alter table public.ai_usage add constraint ai_usage_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind = any (array['generate','explain']));

alter table public.admins add constraint admins_pkey primary key (user_id);
alter table public.admins add constraint admins_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- --------------------------------------------------------------- indexes
--
-- Every per-user read path leads on user_id, so signing in costs an index
-- lookup against your own rows rather than a scan that grows with the whole
-- userbase. That property is what makes the read path scale; keep it.

create index if not exists sr_cards_due on public.sr_cards using btree (user_id, due_date);
create index if not exists generated_questions_user on public.generated_questions using btree (user_id, created_at);
create index if not exists generated_questions_deck on public.generated_questions using btree (deck_id);
create index if not exists question_flags_question_idx on public.question_flags using btree (question_id);
create index if not exists decks_owner_parent on public.decks using btree (owner_id, parent_id, "position");
create index if not exists decks_parent_id_idx on public.decks using btree (parent_id);
create index if not exists ai_usage_created_at_idx on public.ai_usage using btree (created_at desc);
create index if not exists ai_usage_user_id_idx on public.ai_usage using btree (user_id);

-- ------------------------------------------------------------------- RLS

alter table public.profiles            enable row level security;
alter table public.practice_stats      enable row level security;
alter table public.sr_cards            enable row level security;
alter table public.bookmarks           enable row level security;
alter table public.activity            enable row level security;
alter table public.streaks             enable row level security;
alter table public.question_edits      enable row level security;
alter table public.question_flags      enable row level security;
alter table public.decks               enable row level security;
alter table public.generated_questions enable row level security;
alter table public.ai_usage            enable row level security;
alter table public.admins              enable row level security;
alter table public.ops_heartbeat       enable row level security;

-- auth.uid() is wrapped in a sub-select throughout so it is evaluated once
-- per query rather than once per row.

create policy "own profile"             on public.profiles            for all to authenticated using ((select auth.uid()) = id)      with check ((select auth.uid()) = id);
create policy "own practice stats"      on public.practice_stats      for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own sr cards"            on public.sr_cards            for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own bookmarks"           on public.bookmarks           for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own activity"            on public.activity            for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own streak"              on public.streaks             for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own question edits"      on public.question_edits      for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own generated questions" on public.generated_questions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy decks_own                 on public.decks               for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Flags are split per command rather than "for all": a student may write and
-- withdraw their own, and read their own, and that is all. Review happens
-- through admin_flags().
create policy "read own flags"   on public.question_flags for select to authenticated using (user_id = (select auth.uid()));
create policy "write own flags"  on public.question_flags for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own flags" on public.question_flags for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own flags" on public.question_flags for delete to authenticated using (user_id = (select auth.uid()));

-- Token usage is append-only from the client's side: you may record your own
-- call and never read the log back. The admin_tokens_* functions read it.
create policy ai_usage_insert_own on public.ai_usage for insert to authenticated with check (user_id = (select auth.uid()));

-- public.admins and public.ops_heartbeat deliberately have no policies.

-- ------------------------------------------------------------- functions

-- A profile and a streak row for every new account, so the app never has to
-- cope with a signed-in user who has neither. display_name comes from the
-- identity provider when there is one; name_chosen records whether the name
-- was given or invented from the email address, which is what decides who
-- gets asked to pick one after signing up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  given text;
begin
  given := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );

  insert into public.profiles (id, display_name, show_on_leaderboard, marketing_opt_in, name_chosen)
  values (
    new.id,
    coalesce(given, split_part(new.email, '@', 1)),
    true,
    case
      when new.raw_user_meta_data ? 'marketing_opt_in' then
        coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', 'false') in ('true', 't', '1')
      else null
    end,
    given is not null
  );

  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;

-- Progress is keyed on a bare question id and outlives the question, so
-- deleting a question would otherwise leave rows that count towards totals
-- for something nobody can revisit. GEN_ID_BASE (1,000,000) is the offset
-- between a generated_questions row and the id progress is stored under.
create or replace function public.cleanup_question_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  qid bigint := old.id + 1000000;
begin
  delete from public.practice_stats where user_id = old.user_id and question_id = qid;
  delete from public.sr_cards       where user_id = old.user_id and question_id = qid;
  delete from public.bookmarks      where user_id = old.user_id and question_id = qid;
  delete from public.question_flags where user_id = old.user_id and question_id = qid;
  return old;
end;
$$;

-- parent_id only references decks(id), and decks_own permits UPDATE on your
-- own rows, so without this one PATCH could make a deck its own ancestor.
-- A cycle is not cosmetic: the sidebar walks parent_id to build the tree and
-- copy_deck_tree recurses on the same column, so both would run until they
-- died, and the row causing it would still be there on the next load. A cycle
-- is a property of the chain above a row, not of the row, so the check has to
-- climb it.
create or replace function public.forbid_deck_cycle()
returns trigger language plpgsql set search_path = '' as $$
declare
  walker uuid := new.parent_id;
  hops int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A deck cannot be inside itself.';
  end if;

  while walker is not null loop
    if walker = new.id then
      raise exception 'A deck cannot be inside one of its own subdecks.';
    end if;
    hops := hops + 1;
    if hops > 100 then
      raise exception 'Deck nesting is too deep.';
    end if;
    select d.parent_id into walker from public.decks d where d.id = walker;
  end loop;

  return new;
end;
$$;

-- The admin check. Everything below calls it rather than trusting the client,
-- because hiding a nav item hides nothing: leaderboard_week() was callable by
-- anon and leaked every display name until 2026-09-27.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = 'public' as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
$$;

create or replace function public.leaderboard_week()
returns table(user_id uuid, display_name text, week_count integer, streak integer, rank bigint)
language sql stable security definer set search_path = 'public' as $$
  with ranked as (
    select p.id as user_id,
           trim(p.display_name) as display_name,
           coalesce(sum(a.count), 0)::integer as week_count,
           coalesce(s.current, 0)::integer as streak
    from public.profiles p
    left join public.activity a on a.user_id = p.id and a.day >= (current_date - 6)
    left join public.streaks s on s.user_id = p.id
    where p.show_on_leaderboard = true
      and p.display_name is not null
      and length(trim(p.display_name)) > 0
    group by p.id, p.display_name, s.current
  )
  select r.user_id, r.display_name, r.week_count, r.streak,
         rank() over (order by r.week_count desc, r.streak desc, r.display_name asc)
  from ranked r
  order by rank asc, r.display_name asc
  limit 100;
$$;

-- Deck sharing. copy_deck_tree does the work and is not reachable over the
-- API; copy_deck_by_code is the entry point and resolves the caller itself,
-- so a share code grants a copy and never access to the original.
create or replace function public.copy_deck_tree(src_id uuid, new_owner uuid, new_parent uuid)
returns uuid language plpgsql security definer set search_path = 'public' as $$
declare src public.decks%rowtype; new_id uuid; child record;
begin
  select * into src from public.decks where id = src_id;
  insert into public.decks (owner_id, parent_id, name, position)
    values (new_owner, new_parent, src.name, src.position) returning id into new_id;
  insert into public.generated_questions (user_id, payload, deck_id)
    select new_owner, payload, new_id from public.generated_questions where deck_id = src_id;
  for child in select id from public.decks where parent_id = src_id order by position, created_at loop
    perform public.copy_deck_tree(child.id, new_owner, new_id);
  end loop;
  return new_id;
end;
$$;

create or replace function public.copy_deck_by_code(code text)
returns uuid language plpgsql security definer set search_path = 'public' as $$
declare src public.decks%rowtype; me uuid := auth.uid();
begin
  if me is null then return null; end if;
  select * into src from public.decks where share_code = code;
  if src.id is null then return null; end if;
  if src.owner_id = me then return src.id; end if;
  return public.copy_deck_tree(src.id, me, null);
end;
$$;

-- The admin dashboard. Each of these reads across all users, so each one
-- carries its own `where public.is_admin()`; a non-admin calling them gets an
-- empty result rather than an error. admin_set_admin raises instead, and
-- refuses to let you remove your own access so the last admin cannot lock
-- everyone out. These are the full definitions as applied; see
-- supabase/migrations/ and the project's migration history for their order.

create or replace function public.admin_overview()
returns table(sort integer, key text, today bigint, last7 bigint, prev7 bigint, total bigint)
language sql stable security definer set search_path = 'public' as $$
  select 1, 'accounts',
    (select count(*) from auth.users where created_at::date = current_date),
    (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    (select count(*) from auth.users where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    (select count(*) from auth.users)
  where public.is_admin()
  union all
  select 2, 'active',
    (select count(distinct user_id) from public.activity where day = current_date),
    (select count(distinct user_id) from public.activity where day > current_date - 7),
    (select count(distinct user_id) from public.activity where day > current_date - 14 and day <= current_date - 7),
    (select count(distinct user_id) from public.activity)
  where public.is_admin()
  union all
  select 3, 'answers',
    (select coalesce(sum(count), 0) from public.activity where day = current_date),
    (select coalesce(sum(count), 0) from public.activity where day > current_date - 7),
    (select coalesce(sum(count), 0) from public.activity where day > current_date - 14 and day <= current_date - 7),
    (select coalesce(sum(count), 0) from public.activity)
  where public.is_admin()
  union all
  select 4, 'generated',
    (select count(*) from public.generated_questions where created_at::date = current_date),
    (select count(*) from public.generated_questions where created_at >= now() - interval '7 days'),
    (select count(*) from public.generated_questions where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    (select count(*) from public.generated_questions)
  where public.is_admin()
  union all
  select 5, 'flags',
    (select count(*) from public.question_flags where created_at::date = current_date),
    (select count(*) from public.question_flags where created_at >= now() - interval '7 days'),
    (select count(*) from public.question_flags where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    (select count(*) from public.question_flags)
  where public.is_admin()
  union all
  select 6, 'decks',
    (select count(*) from public.decks where created_at::date = current_date),
    (select count(*) from public.decks where created_at >= now() - interval '7 days'),
    (select count(*) from public.decks where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    (select count(*) from public.decks)
  where public.is_admin()
  order by 1
$$;

create or replace function public.admin_overview_daily(days integer default 30)
returns table(day date, key text, value bigint)
language sql stable security definer set search_path = 'public' as $$
  with d as (select generate_series(current_date - (days - 1), current_date, interval '1 day')::date as day)
  select d.day, 'accounts',  (select count(*) from auth.users u where u.created_at::date = d.day) from d where public.is_admin()
  union all
  select d.day, 'active',    (select count(distinct a.user_id) from public.activity a where a.day = d.day) from d where public.is_admin()
  union all
  select d.day, 'answers',   (select coalesce(sum(a.count), 0) from public.activity a where a.day = d.day) from d where public.is_admin()
  union all
  select d.day, 'generated', (select count(*) from public.generated_questions g where g.created_at::date = d.day) from d where public.is_admin()
  union all
  select d.day, 'flags',     (select count(*) from public.question_flags f where f.created_at::date = d.day) from d where public.is_admin()
  union all
  select d.day, 'decks',     (select count(*) from public.decks k where k.created_at::date = d.day) from d where public.is_admin()
  order by 1
$$;

create or replace function public.admin_people()
returns table(user_id uuid, display_name text, email text, joined timestamp with time zone,
              last_active date, answered bigint, generated bigint, is_admin boolean, marketing boolean)
language sql stable security definer set search_path = 'public' as $$
  select u.id, p.display_name, u.email::text, u.created_at,
         (select max(a.day) from public.activity a where a.user_id = u.id),
         (select coalesce(sum(s.total), 0) from public.practice_stats s where s.user_id = u.id),
         (select count(*) from public.generated_questions g where g.user_id = u.id),
         exists (select 1 from public.admins ad where ad.user_id = u.id),
         coalesce(p.marketing_opt_in, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_admin()
  order by u.created_at desc
$$;

create or replace function public.admin_people_daily(days integer default 30)
returns table(user_id uuid, day date, answers bigint)
language sql stable security definer set search_path = 'public' as $$
  select a.user_id, a.day, sum(a.count)
  from public.activity a
  where public.is_admin() and a.day > current_date - days
  group by a.user_id, a.day
  order by a.day
$$;

create or replace function public.admin_generation_daily(days integer default 14)
returns table(day date, questions bigint, people bigint)
language sql stable security definer set search_path = 'public' as $$
  select g.created_at::date, count(*), count(distinct g.user_id)
  from public.generated_questions g
  where public.is_admin() and g.created_at >= (now() - make_interval(days => days))
  group by g.created_at::date
  order by g.created_at::date desc
$$;

create or replace function public.admin_tokens_totals()
returns table(kind text, calls_all bigint, tokens_all bigint, calls_7d bigint, tokens_7d bigint, tokens_today bigint)
language sql stable security definer set search_path = 'public' as $$
  select u.kind, count(*), coalesce(sum(u.total_tokens), 0),
         count(*) filter (where u.created_at >= now() - interval '7 days'),
         coalesce(sum(u.total_tokens) filter (where u.created_at >= now() - interval '7 days'), 0),
         coalesce(sum(u.total_tokens) filter (where u.created_at::date = current_date), 0)
  from public.ai_usage u
  where public.is_admin()
  group by u.kind
  order by u.kind
$$;

create or replace function public.admin_tokens_daily(days integer default 14)
returns table(day date, kind text, calls bigint, input_tokens bigint, output_tokens bigint, total_tokens bigint)
language sql stable security definer set search_path = 'public' as $$
  select u.created_at::date, u.kind, count(*),
         coalesce(sum(u.input_tokens), 0),
         coalesce(sum(u.output_tokens), 0),
         coalesce(sum(u.total_tokens), 0)
  from public.ai_usage u
  where public.is_admin() and u.created_at >= (now() - make_interval(days => days))
  group by u.created_at::date, u.kind
  order by u.created_at::date desc, u.kind
$$;

create or replace function public.admin_flags()
returns table(question_id integer, flags bigint, reasons text[], notes text[], last_flagged timestamp with time zone)
language sql stable security definer set search_path = 'public' as $$
  select f.question_id, count(*), array_agg(distinct f.reason),
         array_remove(array_agg(f.note order by f.created_at desc), null),
         max(f.created_at)
  from public.question_flags f
  where public.is_admin()
  group by f.question_id
  order by max(f.created_at) desc
$$;

create or replace function public.admin_clear_flags(qid integer)
returns void language sql security definer set search_path = 'public' as $$
  delete from public.question_flags f where f.question_id = qid and public.is_admin()
$$;

create or replace function public.admin_marketing()
returns table(display_name text, email text, joined timestamp with time zone)
language sql stable security definer set search_path = 'public' as $$
  select p.display_name, u.email::text, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin() and p.marketing_opt_in
  order by u.created_at desc
$$;

create or replace function public.admin_set_admin(uid uuid, make boolean)
returns void language plpgsql security definer set search_path = 'public' as $$
begin
  if not public.is_admin() then
    raise exception 'Not permitted.';
  end if;
  if make then
    insert into public.admins (user_id) values (uid) on conflict (user_id) do nothing;
  else
    -- so the last admin cannot lock everybody out
    if uid = auth.uid() then
      raise exception 'You cannot remove your own access.';
    end if;
    delete from public.admins where user_id = uid;
  end if;
end;
$$;

-- The keepalive's one query, which also leaves a trace. anon may execute it:
-- the route holds the anon key, and with CRON_SECRET unset a stranger calling
-- it achieves nothing but the job. It takes no arguments, so there is nothing
-- to inject and nothing to choose.
create or replace function public.keepalive_ping()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  now_ts timestamptz := now();
begin
  insert into public.ops_heartbeat (name, last_ok)
       values ('keepalive', now_ts)
  on conflict (name) do update set last_ok = now_ts;
  return now_ts;
end;
$$;

grant execute on function public.keepalive_ping() to anon, authenticated;

-- More than about a day in age_hours means the cron has stopped.
create or replace function public.admin_heartbeats()
returns table(name text, last_ok timestamptz, age_hours numeric)
language sql stable security definer set search_path = 'public' as $$
  select h.name, h.last_ok,
         round(extract(epoch from (now() - h.last_ok)) / 3600.0, 1)
  from public.ops_heartbeat h
  where public.is_admin()
  order by h.name
$$;

-- Only a folder may contain things, and a deck that already holds questions
-- may not become one — that would strand them somewhere nothing can reach.
create or replace function public.decks_shape_ok()
returns trigger language plpgsql set search_path = '' as $$
declare
  parent_is_folder boolean;
begin
  if new.parent_id is not null then
    select is_folder into parent_is_folder from public.decks where id = new.parent_id;
    if parent_is_folder is not true then
      raise exception 'Only a folder can contain decks or folders.';
    end if;
  end if;

  if new.is_folder and not coalesce(old.is_folder, false) then
    if exists (select 1 from public.generated_questions q where q.deck_id = new.id) then
      raise exception 'This has questions in it, so it cannot become a folder.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.decks_shape_ok() from anon, authenticated, public;

-- The same rule from the other side: a question is filed into a deck, never
-- into a folder.
create or replace function public.question_deck_ok()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.deck_id is not null
     and (select is_folder from public.decks where id = new.deck_id) is true then
    raise exception 'Questions go in a deck, not a folder.';
  end if;
  return new;
end;
$$;

revoke all on function public.question_deck_ok() from anon, authenticated, public;

-- -------------------------------------------------------------- triggers

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger cleanup_question_progress
  after delete on public.generated_questions
  for each row execute function public.cleanup_question_progress();

create trigger forbid_deck_cycle
  before insert or update of parent_id on public.decks
  for each row execute function public.forbid_deck_cycle();

create trigger decks_shape_ok
  before insert or update of parent_id, is_folder on public.decks
  for each row execute function public.decks_shape_ok();

create trigger question_deck_ok
  before insert or update of deck_id on public.generated_questions
  for each row execute function public.question_deck_ok();

-- ---------------------------------------------------------------- grants
--
-- Trigger functions and the recursive copy helper are reached by the database
-- itself and must not be callable over /rest/v1/rpc.

revoke all on function public.handle_new_user()            from anon, authenticated, public;
revoke all on function public.cleanup_question_progress()  from anon, authenticated, public;
revoke all on function public.forbid_deck_cycle()          from anon, authenticated, public;
revoke all on function public.copy_deck_tree(uuid, uuid, uuid) from anon, authenticated, public;

-- leaderboard_week is for signed-in users only; it returns display names.
revoke all on function public.leaderboard_week() from anon;
