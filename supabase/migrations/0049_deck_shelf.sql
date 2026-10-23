-- A deck of yours filed under a ready-made heading ("Year 2"), 2026-10-23.
-- Those headings group the featured decks and have no deck row, so a deck
-- dropped into one stays top-level (parent_id null) and remembers the
-- heading's name here. Display only; nothing else reads it.
alter table public.decks add column if not exists shelf text check (char_length(shelf) <= 80);
comment on column public.decks.shelf is 'A top-level deck of yours filed under a ready-made heading ("Year 2"), which has no deck row of its own. Display only.';
