-- The welcome note (2026-10-19): one published announcement marked as the
-- welcome. New accounts see its opening on Home, and it counts as new on
-- What's new for anyone who has never opened that page, whenever they
-- joined. At most one; marking another moves it.
alter table public.announcements add column if not exists welcome boolean not null default false;
create unique index if not exists announcements_one_welcome on public.announcements (welcome) where welcome;

create or replace function public.admin_set_welcome(p_id bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update announcements set welcome = false where welcome and id is distinct from p_id;
  if p_id is not null then update announcements set welcome = true where id = p_id; end if;
end; $$;
revoke all on function public.admin_set_welcome(bigint) from public, anon;
grant execute on function public.admin_set_welcome(bigint) to authenticated;
