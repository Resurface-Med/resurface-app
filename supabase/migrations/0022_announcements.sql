-- Announcements (2026-10-19): news from Resurface, read from a bell in the
-- app with a badge for anything new. Everyone signed in can read them; only
-- admins post or remove them, through the functions below. What you have
-- seen is one timestamp on your profile — anything newer counts as new.

create table if not exists public.announcements (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null default '' check (length(body) <= 4000),
  author uuid references auth.users (id) on delete set null
);
alter table public.announcements enable row level security;
create policy "announcements readable when signed in" on public.announcements
  for select to authenticated using (true);
create index if not exists announcements_created_at on public.announcements (created_at desc);

alter table public.profiles add column if not exists announcements_seen_at timestamptz;

create or replace function public.admin_post_announcement(p_title text, p_body text)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare new_id bigint;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into announcements (title, body, author) values (trim(p_title), coalesce(trim(p_body), ''), auth.uid())
  returning id into new_id;
  return new_id;
end; $$;

create or replace function public.admin_delete_announcement(p_id bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from announcements where id = p_id;
end; $$;

revoke all on function public.admin_post_announcement(text, text) from public, anon;
revoke all on function public.admin_delete_announcement(bigint) from public, anon;
grant execute on function public.admin_post_announcement(text, text) to authenticated;
grant execute on function public.admin_delete_announcement(bigint) to authenticated;
