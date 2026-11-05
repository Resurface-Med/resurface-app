-- Every option shown after answering, by default (Rafil, 2026-11-05).
--
-- It was off by default with a toggle to show them; now it's on, with the
-- toggle to hide them. A third of students had already turned it on. The
-- others are switched on too: an untouched setting and a deliberate "off"
-- look the same, so anyone who wants them hidden hides them again.
alter table public.profiles alter column show_all_options set default true;
update public.profiles set show_all_options = true where show_all_options is distinct from true;
