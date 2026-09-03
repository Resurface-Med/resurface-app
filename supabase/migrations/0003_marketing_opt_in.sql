-- Email-list opt-in. Default off. Copied from signup metadata when present.
alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false;

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
    coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', 'false') in ('true', 't', '1')
  );
  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;
