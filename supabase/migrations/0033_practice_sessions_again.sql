-- Past sessions, back (2026-10-20): the table from 0027 (dropped in 0028),
-- for Study's past sessions and the mistakes waiting in them. Unchanged:
-- one row per session, rewritten as it goes; your own rows only; the
-- newest 50 per person kept. Items now also carry `ok` (right or wrong as
-- answered), inside the items json, so no new column.

create table if not exists public.practice_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  label text not null default '' check (length(label) <= 200),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 1000),
  idx integer not null default 0,
  total integer not null default 0,
  answered integer not null default 0,
  correct integer not null default 0,
  finished boolean not null default false
);
create index if not exists practice_sessions_user_updated on public.practice_sessions (user_id, updated_at desc);

alter table public.practice_sessions enable row level security;
create policy "own sessions: read" on public.practice_sessions for select to authenticated using (user_id = auth.uid());
create policy "own sessions: add" on public.practice_sessions for insert to authenticated with check (user_id = auth.uid());
create policy "own sessions: change" on public.practice_sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sessions: remove" on public.practice_sessions for delete to authenticated using (user_id = auth.uid());

-- A save sent late (a retry from the offline queue, say) never overwrites a
-- newer one.
create or replace function public.practice_sessions_keep_newest()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.updated_at < old.updated_at then return null; end if;
  return new;
end; $$;
drop trigger if exists practice_sessions_keep_newest on public.practice_sessions;
create trigger practice_sessions_keep_newest before update on public.practice_sessions
  for each row execute function public.practice_sessions_keep_newest();

-- Keep the newest 50 per person.
create or replace function public.practice_sessions_prune()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  delete from practice_sessions
   where user_id = new.user_id
     and id in (select id from practice_sessions where user_id = new.user_id
                order by updated_at desc offset 50);
  return null;
end; $$;
drop trigger if exists practice_sessions_prune on public.practice_sessions;
create trigger practice_sessions_prune after insert on public.practice_sessions
  for each row execute function public.practice_sessions_prune();
