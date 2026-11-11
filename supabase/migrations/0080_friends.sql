-- Friends on the leaderboard (Rafil, 2026-11-11).
--
-- Mutual, and made only by a link: everyone has one friend code
-- (/f/<code>), and opening someone's link while signed in makes the two of
-- you friends both ways. Sending the link is the consent, so there are no
-- requests and no way to look people up. Someone hidden from the leaderboard
-- stays hidden from friends too.
--
-- Both tables have RLS on and no policies: only the SECURITY DEFINER
-- functions below read or write them.
create table public.friend_codes (
  user_id uuid primary key references auth.users on delete cascade,
  code text not null unique check (code ~ '^[a-f0-9]{10}$'),
  created_at timestamptz not null default now()
);
alter table public.friend_codes enable row level security;

-- One row each way, so "my friends" is a plain lookup on user_id.
-- new_account: the link was opened by an account made in the last day,
-- i.e. it brought someone in (for the weekly email).
create table public.friendships (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  new_account boolean not null default false,
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friendships enable row level security;
create index friendships_friend on public.friendships (friend_id);

-- My code, made the first time it is asked for.
create function public.my_friend_code()
returns text language plpgsql security definer set search_path to 'public' as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select code into c from friend_codes where user_id = auth.uid();
  while c is null loop
    begin
      insert into friend_codes (user_id, code)
      values (auth.uid(), substr(md5(gen_random_uuid()::text), 1, 10))
      returning code into c;
    exception when unique_violation then
      select code into c from friend_codes where user_id = auth.uid();
    end;
  end loop;
  return c;
end $$;

-- For the link preview (no sign-in): the sender's first name only.
create function public.friend_link_preview(code text)
returns table (first_name text) language sql stable security definer set search_path to 'public' as $$
  select nullif(split_part(trim(p.display_name), ' ', 1), '')
  from friend_codes f join profiles p on p.id = f.user_id
  where f.code = friend_link_preview.code
$$;

-- Open a friend link. Returns who it was, and whether you already were.
create function public.add_friend(code text)
returns table (friend_id uuid, display_name text, already boolean)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare them uuid; fresh boolean; was boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select f.user_id into them from friend_codes f where f.code = add_friend.code;
  if them is null then raise exception 'friend_link_unknown' using errcode = 'P0002'; end if;
  if them = auth.uid() then raise exception 'friend_link_own' using errcode = 'P0001'; end if;
  select exists (select 1 from friendships s where s.user_id = auth.uid() and s.friend_id = them) into was;
  select u.created_at > now() - interval '1 day' into fresh from auth.users u where u.id = auth.uid();
  insert into friendships (user_id, friend_id, new_account) values
    (auth.uid(), them, coalesce(fresh, false)), (them, auth.uid(), coalesce(fresh, false))
  on conflict do nothing;
  return query select them, trim(p.display_name), was from profiles p where p.id = them;
end $$;

create function public.remove_friend(friend uuid)
returns void language sql security definer set search_path to 'public' as $$
  delete from friendships
  where auth.uid() is not null
    and ((user_id = auth.uid() and friend_id = friend) or (user_id = friend and friend_id = auth.uid()))
$$;

-- Everyone you are friends with, hidden or not (they are your own list),
-- for the Edit friends window.
create function public.my_friends()
returns table (user_id uuid, display_name text, avatar text, since timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select s.friend_id, trim(p.display_name), public.avatar_of(p.avatar_v, u.raw_user_meta_data), s.created_at
  from friendships s
  join profiles p on p.id = s.friend_id
  join auth.users u on u.id = s.friend_id
  where s.user_id = auth.uid()
  order by lower(trim(p.display_name))
$$;

-- The Friends board: leaderboard_week's rules (named, shown on the
-- leaderboard, confirmed email), limited to you and your friends.
create function public.leaderboard_friends(on_day date default null)
returns table (user_id uuid, display_name text, week_count integer, streak integer, rank bigint, avatar text)
language sql stable security definer set search_path to 'public' as $$
  with circle as (
    select auth.uid() as id where auth.uid() is not null
    union
    select s.friend_id from friendships s where s.user_id = auth.uid()
  ),
  ranked as (
    select
      p.id as user_id,
      trim(p.display_name) as display_name,
      coalesce(sum(a.count), 0)::integer as week_count,
      (case when s.last_date >= current_date - 1 then coalesce(s.current, 0) else 0 end)::integer as streak,
      public.avatar_of(p.avatar_v, u.raw_user_meta_data) as avatar
    from circle c
    join public.profiles p on p.id = c.id
    join auth.users u on u.id = p.id and u.email_confirmed_at is not null
    left join public.activity a
      on a.user_id = p.id
     and case
           when on_day is null then a.day >= (current_date - 6)
           when on_day between current_date - 1 and current_date + 1 then a.day = on_day
           else false
         end
    left join public.streaks s on s.user_id = p.id
    where p.show_on_leaderboard = true
      and p.display_name is not null
      and length(trim(p.display_name)) > 0
    group by p.id, p.display_name, s.current, s.last_date, p.avatar_v, u.raw_user_meta_data
  )
  select r.user_id, r.display_name, r.week_count, r.streak,
         rank() over (order by r.week_count desc, r.streak desc, r.display_name asc),
         r.avatar
  from ranked r
  order by 5 asc, r.display_name asc
$$;

revoke all on function public.my_friend_code(), public.add_friend(text), public.remove_friend(uuid),
  public.my_friends(), public.leaderboard_friends(date) from public, anon;
grant execute on function public.my_friend_code(), public.add_friend(text), public.remove_friend(uuid),
  public.my_friends(), public.leaderboard_friends(date) to authenticated;
revoke all on function public.friend_link_preview(text) from public;
grant execute on function public.friend_link_preview(text) to anon, authenticated;
