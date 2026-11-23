-- Christmas referral raffle (2026-11-23).
--
-- Personal /r/<code> links attribute a new signup to a referrer. A raffle
-- ticket is earned only when the referred account answers ≥1 question.
-- Friends (/f/...) stay separate. No membership/billing in this migration.

create table public.referral_codes (
  user_id uuid primary key references auth.users on delete cascade,
  code text not null unique check (code ~ '^[a-f0-9]{10}$'),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;

create table public.referral_campaign (
  id smallint primary key default 1 check (id = 1),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  check (ends_at > starts_at)
);
alter table public.referral_campaign enable row level security;

create table public.referrals (
  referred_id uuid primary key references auth.users on delete cascade,
  referrer_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  check (referred_id <> referrer_id)
);
alter table public.referrals enable row level security;
create index referrals_referrer on public.referrals (referrer_id);
create index referrals_qualified on public.referrals (referrer_id) where qualified_at is not null;

insert into public.referral_campaign (id, name, starts_at, ends_at, active)
values (
  1,
  'Christmas 2026',
  timestamptz '2026-11-23 00:00:00+00',
  timestamptz '2027-01-06 00:00:00+00',
  true
);

create or replace function public.referral_campaign_live()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from referral_campaign c
     where c.id = 1 and c.active
       and now() >= c.starts_at and now() < c.ends_at
  );
$$;

create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select code into c from referral_codes where user_id = auth.uid();
  while c is null loop
    begin
      insert into referral_codes (user_id, code)
      values (auth.uid(), substr(md5(gen_random_uuid()::text), 1, 10))
      returning code into c;
    exception when unique_violation then
      select code into c from referral_codes where user_id = auth.uid();
    end;
  end loop;
  return c;
end;
$$;

/* Claim a pending referral code for the signed-in user (once). */
create or replace function public.claim_referral(code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  them uuid;
  joined timestamptz;
  camp_ok boolean;
  already uuid;
  q_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if code is null or code !~ '^[a-f0-9]{10}$' then
    raise exception 'referral_unknown' using errcode = 'P0002';
  end if;

  select user_id into them from referral_codes where referral_codes.code = claim_referral.code;
  if them is null then raise exception 'referral_unknown' using errcode = 'P0002'; end if;
  if them = auth.uid() then raise exception 'referral_own' using errcode = 'P0001'; end if;

  select referrer_id into already from referrals where referred_id = auth.uid();
  if already is not null then
    return jsonb_build_object('ok', true, 'already', true, 'referrer_id', already);
  end if;

  select created_at into joined from auth.users where id = auth.uid();
  -- Only fresh accounts (≤7 days) can be attributed.
  if joined is null or joined < now() - interval '7 days' then
    raise exception 'referral_too_old' using errcode = 'P0003';
  end if;

  select public.referral_campaign_live() into camp_ok;
  if not camp_ok then
    raise exception 'referral_campaign_closed' using errcode = 'P0004';
  end if;

  -- Already practised? Qualify immediately.
  if exists (select 1 from answer_log a where a.user_id = auth.uid()) then
    q_at := now();
  end if;

  insert into referrals (referred_id, referrer_id, created_at, qualified_at)
  values (auth.uid(), them, now(), q_at);

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'referrer_id', them,
    'qualified', q_at is not null
  );
end;
$$;

create or replace function public.my_referral_stats()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c text;
  camp record;
  tickets int;
  pending int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  c := public.my_referral_code();
  select * into camp from referral_campaign where id = 1;
  select count(*)::int into tickets
    from referrals r
   where r.referrer_id = auth.uid()
     and r.qualified_at is not null
     and camp.id is not null
     and r.created_at >= camp.starts_at
     and r.created_at < camp.ends_at;
  select count(*)::int into pending
    from referrals r
   where r.referrer_id = auth.uid()
     and r.qualified_at is null
     and camp.id is not null
     and r.created_at >= camp.starts_at
     and r.created_at < camp.ends_at;
  return jsonb_build_object(
    'code', c,
    'tickets', coalesce(tickets, 0),
    'pending', coalesce(pending, 0),
    'campaign', case when camp.id is null then null else jsonb_build_object(
      'name', camp.name,
      'starts_at', camp.starts_at,
      'ends_at', camp.ends_at,
      'active', camp.active and now() >= camp.starts_at and now() < camp.ends_at
    ) end
  );
end;
$$;

create or replace function public.admin_referral_board()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare camp record;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into camp from referral_campaign where id = 1;
  return jsonb_build_object(
    'campaign', case when camp.id is null then null else jsonb_build_object(
      'name', camp.name,
      'starts_at', camp.starts_at,
      'ends_at', camp.ends_at,
      'active', camp.active and now() >= camp.starts_at and now() < camp.ends_at
    ) end,
    'rows', coalesce((
      select jsonb_agg(x order by x.tickets desc, x.display_name)
      from (
        select r.referrer_id as user_id,
               coalesce(nullif(trim(p.display_name), ''), 'Someone') as display_name,
               count(*) filter (where r.qualified_at is not null)::int as tickets,
               count(*) filter (where r.qualified_at is null)::int as pending,
               count(*)::int as total
          from referrals r
          join profiles p on p.id = r.referrer_id
         where camp.id is not null
           and r.created_at >= camp.starts_at
           and r.created_at < camp.ends_at
         group by r.referrer_id, p.display_name
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

/* Weighted draw: one ticket per qualified referral in the campaign window. */
create or replace function public.admin_referral_draw()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  camp record;
  pick uuid;
  tickets int;
  name text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into camp from referral_campaign where id = 1;
  if camp.id is null then raise exception 'no campaign'; end if;

  select count(*)::int into tickets
    from referrals r
   where r.qualified_at is not null
     and r.created_at >= camp.starts_at
     and r.created_at < camp.ends_at;
  if tickets is null or tickets < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no_tickets');
  end if;

  select r.referrer_id into pick
    from referrals r
   where r.qualified_at is not null
     and r.created_at >= camp.starts_at
     and r.created_at < camp.ends_at
   order by random()
   limit 1;

  select coalesce(nullif(trim(p.display_name), ''), 'Someone') into name
    from profiles p where p.id = pick;

  return jsonb_build_object(
    'ok', true,
    'winner_id', pick,
    'display_name', name,
    'tickets_in_pool', tickets
  );
end;
$$;

/* First answer qualifies a pending referral. */
create or replace function public.tg_referral_qualify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update referrals
     set qualified_at = now()
   where referred_id = new.user_id
     and qualified_at is null;
  return null;
end;
$$;

drop trigger if exists referral_qualify on public.answer_log;
create trigger referral_qualify
  after insert on public.answer_log
  for each row execute function public.tg_referral_qualify();

revoke all on function public.referral_campaign_live() from public, anon, authenticated;
revoke all on function public.my_referral_code() from public, anon;
revoke all on function public.claim_referral(text) from public, anon;
revoke all on function public.my_referral_stats() from public, anon;
revoke all on function public.admin_referral_board() from public, anon, authenticated;
revoke all on function public.admin_referral_draw() from public, anon, authenticated;
revoke all on function public.tg_referral_qualify() from public, anon, authenticated;

grant execute on function public.my_referral_code() to authenticated;
grant execute on function public.claim_referral(text) to authenticated;
grant execute on function public.my_referral_stats() to authenticated;
grant execute on function public.admin_referral_board() to authenticated;
grant execute on function public.admin_referral_draw() to authenticated;
