-- A sign-up is finishing the first pop-up, not the moment the account
-- exists. Google answers the emails box there; email sign-up chooses a
-- name there. People who already finished are dated from when the account
-- was created, which is the closest time we have.

alter table public.profiles
  add column if not exists signed_up_at timestamp with time zone;

create or replace function public.mark_signed_up()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.signed_up_at := old.signed_up_at;
  if old.signed_up_at is null and (
    (old.marketing_opt_in is null and new.marketing_opt_in is not null)
    or (old.name_chosen is not true and new.name_chosen is true)
  ) then
    new.signed_up_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_mark_signed_up on public.profiles;
create trigger profiles_mark_signed_up
  before update on public.profiles
  for each row execute function public.mark_signed_up();

update public.profiles p
set signed_up_at = u.created_at
from auth.users u
where p.id = u.id
  and p.signed_up_at is null
  and (
    (
      exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google')
      and p.marketing_opt_in is not null
    )
    or (
      not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google')
      and p.name_chosen
    )
  );

drop function if exists public.admin_people();

create function public.admin_people()
returns table(
  user_id uuid,
  display_name text,
  email text,
  joined timestamp with time zone,
  last_active date,
  answered bigint,
  generated bigint,
  is_admin boolean,
  marketing boolean,
  signed_up timestamp with time zone
)
language sql stable security definer set search_path = public as $$
  select u.id, p.display_name, u.email::text, u.created_at,
         (select max(a.day) from public.activity a where a.user_id = u.id),
         (select coalesce(sum(s.total), 0) from public.practice_stats s where s.user_id = u.id),
         (select count(*) from public.generated_questions g where g.user_id = u.id),
         exists (select 1 from public.admins ad where ad.user_id = u.id),
         coalesce(p.marketing_opt_in, false),
         p.signed_up_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_admin()
  order by u.created_at desc
$$;

revoke all on function public.admin_people() from public;
grant execute on function public.admin_people() to authenticated;
