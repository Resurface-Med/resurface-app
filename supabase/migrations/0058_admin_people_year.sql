-- Admin's People list also says which year someone is in and on how many
-- days they've studied (2026-10-26, Admin redo): "gone quiet" means someone
-- who studied on a few days and has stopped, not someone who tried it once.
drop function if exists public.admin_people();
create function public.admin_people()
returns table(user_id uuid, display_name text, email text, joined timestamptz, last_active date,
              answered bigint, generated bigint, is_admin boolean, marketing boolean,
              study_year smallint, active_days bigint)
language sql stable security definer set search_path = public as $$
  select u.id,
         p.display_name,
         u.email::text,
         u.created_at,
         (select max(a.day) from public.activity a where a.user_id = u.id),
         (select coalesce(sum(s.total), 0) from public.practice_stats s where s.user_id = u.id),
         (select count(*) from public.generated_questions g where g.user_id = u.id),
         exists (select 1 from public.admins ad where ad.user_id = u.id),
         coalesce(p.marketing_opt_in, false),
         p.study_year,
         (select count(*) from public.activity a where a.user_id = u.id and a.count > 0)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_admin() and u.email_confirmed_at is not null
  order by u.created_at desc
$$;
revoke all on function public.admin_people() from public, anon;
grant execute on function public.admin_people() to authenticated;
