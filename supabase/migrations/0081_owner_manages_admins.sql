-- Only the owner (Rafil) can make or remove admins (2026-11-12). Other admins
-- keep the Admin tab but can't grant access or take anyone's away, and nobody
-- can remove the owner.
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() = '0b920395-b28e-442e-a68b-28e0b7d0a06b'::uuid $$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

create or replace function public.admin_set_admin(uid uuid, make boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change who is an admin.';
  end if;
  if make then
    insert into public.admins (user_id) values (uid) on conflict (user_id) do nothing;
  else
    if uid = auth.uid() then
      raise exception 'You cannot remove your own access.';
    end if;
    delete from public.admins where user_id = uid;
  end if;
end;
$$;
