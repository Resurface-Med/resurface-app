-- My notes (2026-10-30): a student's own note on a question, written after
-- answering it. One per person per question, edited in place; private —
-- each person reads and writes only their own. Keyed by question id like
-- bookmarks, so a note survives edits to the question and never travels
-- with a shared deck.

create table if not exists public.question_notes (
  user_id     uuid not null references auth.users on delete cascade,
  question_id int  not null,
  body        text not null check (char_length(body) <= 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.question_notes enable row level security;

create policy "own notes: read"   on public.question_notes for select to authenticated using (user_id = auth.uid());
create policy "own notes: insert" on public.question_notes for insert to authenticated with check (user_id = auth.uid());
create policy "own notes: update" on public.question_notes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notes: delete" on public.question_notes for delete to authenticated using (user_id = auth.uid());
