-- Who reported a question, on the admin list. The return type gains a
-- column, which create or replace cannot do, so the function is replaced.

drop function if exists public.admin_flags();

create function public.admin_flags()
returns table(
  question_id integer,
  flags bigint,
  reasons text[],
  notes text[],
  last_flagged timestamp with time zone,
  reporters jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select f.question_id,
         count(*),
         array_agg(distinct f.reason),
         array_remove(array_agg(f.note order by f.created_at desc), null),
         max(f.created_at),
         jsonb_agg(
           jsonb_build_object(
             'name', nullif(btrim(p.display_name), ''),
             'email', u.email::text,
             'note', nullif(btrim(f.note), '')
           )
           order by f.created_at desc
         )
  from public.question_flags f
  left join public.profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  where public.is_admin()
  group by f.question_id
  order by max(f.created_at) desc
$$;

revoke all on function public.admin_flags() from public;
grant execute on function public.admin_flags() to authenticated;
