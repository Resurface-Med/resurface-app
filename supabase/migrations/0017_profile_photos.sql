-- Profile photos (2026-10-18).
--
-- Built for the least database work: the picture is never in the database.
-- It is a ~10 KB WebP, shrunk on the device, in a public Storage bucket at
-- avatars/{user id}, served from Storage's CDN. The database holds one small
-- number per person, avatar_v:
--
--   null  no photo chosen: their Google photo if they signed in with Google
--   0     no photo (removed by them, or by an admin)
--   n > 0 their upload, version n — part of the address, so a browser can
--         keep the image for good and fetch again only when it changes
--
-- The leaderboard already reads every row it shows, so it carries each
-- person's photo address along for nothing extra.

alter table public.profiles add column if not exists avatar_v integer;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 262144, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 262144,
  allowed_mime_types = array['image/webp', 'image/jpeg'];

-- Your own file only: named by your id, nothing else in the bucket.
create policy "avatars: own file readable" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text);
create policy "avatars: own file writable" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text);
create policy "avatars: own file replaceable" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text);
create policy "avatars: own file deletable" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text);

-- What to draw for a person: "v<n>" for an upload (the app builds the
-- public address), a Google photo's address, or null for initials.
create or replace function public.avatar_of(v integer, meta jsonb)
returns text language sql immutable as $$
  select case
    when v > 0 then 'v' || v
    when v = 0 then null
    else nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture'), '')
  end;
$$;

-- The weekly board, now with each person's photo. Same rows as before.
drop function if exists public.leaderboard_week();
create function public.leaderboard_week()
returns table (user_id uuid, display_name text, week_count integer, streak integer, rank bigint, avatar text)
language sql stable security definer set search_path to 'public' as $$
  with ranked as (
    select
      p.id as user_id,
      trim(p.display_name) as display_name,
      coalesce(sum(a.count), 0)::integer as week_count,
      (case when s.last_date >= current_date - 1 then coalesce(s.current, 0) else 0 end)::integer as streak,
      public.avatar_of(p.avatar_v, u.raw_user_meta_data) as avatar
    from public.profiles p
    join auth.users u
      on u.id = p.id
     and u.email_confirmed_at is not null
    left join public.activity a
      on a.user_id = p.id
     and a.day >= (current_date - 6)
    left join public.streaks s
      on s.user_id = p.id
    where p.show_on_leaderboard = true
      and p.display_name is not null
      and length(trim(p.display_name)) > 0
    group by p.id, p.display_name, s.current, s.last_date, p.avatar_v, u.raw_user_meta_data
  )
  select r.user_id, r.display_name, r.week_count, r.streak,
         rank() over (order by r.week_count desc, r.streak desc, r.display_name asc) as rank,
         r.avatar
  from ranked r
  order by rank asc, r.display_name asc
  limit 100;
$$;
revoke all on function public.leaderboard_week() from public, anon;
grant execute on function public.leaderboard_week() to authenticated, service_role;

-- An admin taking a photo down. The file stays in the bucket until its
-- owner replaces it, but nothing points at it.
create or replace function public.admin_remove_avatar(uid uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.profiles set avatar_v = 0 where id = uid;
end; $$;
revoke all on function public.admin_remove_avatar(uuid) from public, anon;
grant execute on function public.admin_remove_avatar(uuid) to authenticated;
