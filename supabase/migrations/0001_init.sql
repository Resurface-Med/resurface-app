-- Resurface: per-user study data.
--
-- The server is the source of truth. Every table is keyed by auth.uid() and
-- readable only by its owner, enforced by Postgres rather than app code — the
-- browser holds an anon key, so RLS is the actual security boundary.
--
-- question_id refers to the bundled bank in content/decks (ids 1..N) and to
-- AI-generated questions, which are numbered above 9999.

-- ── profiles ──────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  daily_goal   int  not null default 20 check (daily_goal between 1 and 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── practice stats ────────────────────────────────────────────────────────
create table public.practice_stats (
  user_id     uuid not null references auth.users on delete cascade,
  question_id int  not null,
  correct     int  not null default 0 check (correct >= 0),
  total       int  not null default 0 check (total >= correct),
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- ── spaced repetition ─────────────────────────────────────────────────────
-- Mirrors the shape sm2Review returns, so a card round-trips without lossy
-- translation. interval_minutes is null once a card graduates to days.
create table public.sr_cards (
  user_id          uuid not null references auth.users on delete cascade,
  question_id      int  not null,
  interval         int  not null default 0,
  repetitions      int  not null default 0,
  ease_factor      numeric(4,2) not null default 2.5,
  lapses           int  not null default 0,
  due_date         timestamptz,
  interval_minutes int,
  updated_at       timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index sr_cards_due on public.sr_cards (user_id, due_date);

-- ── bookmarks ─────────────────────────────────────────────────────────────
create table public.bookmarks (
  user_id     uuid not null references auth.users on delete cascade,
  question_id int  not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- ── activity heatmap ──────────────────────────────────────────────────────
-- One row per local day. Stored as a date rather than a timestamp because the
-- heatmap is drawn in the user's own timezone, not UTC.
create table public.activity (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  count   int  not null default 0 check (count >= 0),
  primary key (user_id, day)
);

-- ── streak ────────────────────────────────────────────────────────────────
create table public.streaks (
  user_id    uuid primary key references auth.users on delete cascade,
  current    int  not null default 0,
  longest    int  not null default 0,
  last_date  date,
  updated_at timestamptz not null default now()
);

-- ── timed mode best scores ────────────────────────────────────────────────
create table public.timed_bests (
  user_id    uuid not null references auth.users on delete cascade,
  scope      text not null,
  score      int  not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

-- ── AI-generated questions ────────────────────────────────────────────────
-- The question itself is jsonb: it is authored by the model in the shape the
-- app already renders, and normalising five options into rows would buy
-- nothing when nothing ever queries inside it.
create table public.generated_questions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
create index generated_questions_user on public.generated_questions (user_id, created_at);

-- ── manual edits to bank questions ────────────────────────────────────────
create table public.question_edits (
  user_id     uuid not null references auth.users on delete cascade,
  question_id int  not null,
  payload     jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- ── row level security ────────────────────────────────────────────────────
-- Same shape for every table: you may only touch rows that are yours. Written
-- out per table rather than generated, so the policy is greppable.
alter table public.profiles            enable row level security;
alter table public.practice_stats      enable row level security;
alter table public.sr_cards            enable row level security;
alter table public.bookmarks           enable row level security;
alter table public.activity            enable row level security;
alter table public.streaks             enable row level security;
alter table public.timed_bests         enable row level security;
alter table public.generated_questions enable row level security;
alter table public.question_edits      enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own practice stats" on public.practice_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own sr cards" on public.sr_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own bookmarks" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own activity" on public.activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own streak" on public.streaks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own timed bests" on public.timed_bests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own generated questions" on public.generated_questions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own question edits" on public.question_edits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── new user bootstrap ────────────────────────────────────────────────────
-- A profile row must exist before the app can read a daily goal, so create it
-- on signup rather than making every read handle a missing row.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
