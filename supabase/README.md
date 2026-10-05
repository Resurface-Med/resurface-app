# Database

`schema.sql` is the whole schema, read out of the live project. It is the file
to trust and the file to read.

`migrations/` holds four early migrations and is **not** a complete history.
Twenty-five migrations have been applied; the rest were applied directly to the
project and exist only inside Supabase, which is also where the migration
history lives. So losing the project would lose the database and the record of
how to rebuild it at the same time, which is the reason `schema.sql` exists.

Don't try to reconstruct the schema by replaying `migrations/`. If you change
the database, apply the change and then update `schema.sql` to match, by
reading `pg_catalog` rather than by editing it from memory.

## The two things that hold

**RLS is the boundary, not the client.** Every table has row level security on,
and every policy is scoped to `auth.uid()`. The Supabase URL and publishable
key are committed and compile into the bundle; that is fine, because they grant
nothing on their own. The `service_role` key must never appear in this repo.

**Admin lives in Postgres.** `public.admins` has RLS on and no policies at all,
so it cannot be read or written over the API. The `admin_*` functions are
`SECURITY DEFINER` and each one checks `public.is_admin()` itself, so hiding
the nav item is not a control and never was.
