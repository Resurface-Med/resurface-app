-- The database's size, for Admin's storage warning (2026-10-26). The free
-- plan stops accepting writes past 500 MB; Admin shows how close we are.
create or replace function public.admin_storage()
returns bigint language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return pg_database_size(current_database());
end $$;
revoke all on function public.admin_storage() from public, anon;
grant execute on function public.admin_storage() to authenticated;
