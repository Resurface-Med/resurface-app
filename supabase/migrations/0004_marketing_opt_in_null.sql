-- Distinguish "never asked" (null) from opted out (false).
-- Google sign-up has no marketing metadata, so leave it null and ask in-app.

alter table public.profiles
  alter column marketing_opt_in drop not null;

alter table public.profiles
  alter column marketing_opt_in set default null;

update public.profiles p
set marketing_opt_in = null
from auth.users u
where p.id = u.id
  and coalesce(u.raw_app_meta_data ->> 'provider', '') = 'google'
  and p.marketing_opt_in is not true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, show_on_leaderboard, marketing_opt_in)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    true,
    case
      when new.raw_user_meta_data ? 'marketing_opt_in' then
        coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', 'false') in ('true', 't', '1')
      else null
    end
  );
  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;
