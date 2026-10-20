-- Two security advisories (2026-10-20, from the activation audit).
--
-- avatar_of had no fixed search_path. It touches no tables, so this changes
-- nothing it does; it only stops a caller's search_path being able to.
--
-- admin_heartbeats() was executable by anyone, signed in or not: granted to
-- PUBLIC, which anon inherits. It checks is_admin() itself, so nothing was
-- exposed, but it should not be callable from outside at all. Signed-in
-- users keep EXECUTE (Admin calls it); the function still refuses non-admins.

alter function public.avatar_of(integer, jsonb) set search_path = public, pg_temp;

revoke execute on function public.admin_heartbeats() from public, anon;
grant execute on function public.admin_heartbeats() to authenticated;
