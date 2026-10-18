-- Who sent whose deck to whom (2026-10-18): an audit log for Admin.
--
-- One row per thing that happened to a shared deck:
--   opened    someone opened a share link (not the deck's owner)
--   copied    they added it — a copy appeared in their decks
--   updated   they brought an existing copy up to date (new questions)
--   switched  their old copy of a featured deck was swapped for the live one
--
-- "From" is the owner of the deck whose link was used: if Jacob's deck
-- reached Omar, and Omar shared his copy on, the second row is from Omar.
-- Copies made before this log existed are filled in from decks.source_deck_id
-- (who and when are exact; the question count is the copy as it is now).
-- Opening and updating were not recorded before, so they start from here.

create table if not exists public.share_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('opened', 'copied', 'updated', 'switched')),
  deck_id uuid,                 -- the deck whose link was used (or the featured deck)
  deck_name text,
  from_user uuid,               -- that deck's owner
  to_user uuid,                 -- who opened / received it
  questions integer,            -- copied: in the copy; updated: added; switched: moved
  copy_id uuid
);
alter table public.share_events enable row level security;
-- No policies: written by the functions below, read by admin_share_log().
create index if not exists share_events_at on public.share_events (at desc);

create or replace function public.deck_tree_questions(root uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  with recursive t as (select root id union all select d.id from decks d join t on d.parent_id = t.id)
  select count(*)::int from generated_questions g where g.deck_id in (select id from t);
$$;
revoke all on function public.deck_tree_questions(uuid) from public, anon, authenticated;

-- Backfill: every copy that is the top of its copied tree.
insert into public.share_events (at, kind, deck_id, deck_name, from_user, to_user, questions, copy_id)
select c.created_at, 'copied', s.id, s.name, s.owner_id, c.owner_id, public.deck_tree_questions(c.id), c.id
from public.decks c
join public.decks s on s.id = c.source_deck_id
left join public.decks cp on cp.id = c.parent_id
where c.owner_id <> s.owner_id
  and (cp.id is null or cp.source_deck_id is distinct from s.parent_id)
  and not exists (select 1 from public.share_events e where e.copy_id = c.id and e.kind = 'copied');

-- Copying, now logged.
create or replace function public.copy_deck_by_code(code text, skip bigint[] default '{}')
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare src public.decks%rowtype; me uuid := auth.uid(); new_id uuid;
begin
  if me is null then return null; end if;
  select * into src from public.decks where share_code = code;
  if src.id is null then return null; end if;
  if src.owner_id = me then return src.id; end if;
  new_id := public.copy_deck_tree(src.id, me, null, coalesce(skip, '{}'));
  insert into public.share_events (kind, deck_id, deck_name, from_user, to_user, questions, copy_id)
  values ('copied', src.id, src.name, src.owner_id, me, public.deck_tree_questions(new_id), new_id);
  return new_id;
end; $$;

-- Updating a copy, now logged.
create or replace function public.update_copy_by_code(code text, skip bigint[] default '{}')
returns integer language plpgsql security definer set search_path to 'public' as $$
declare src public.decks%rowtype; me uuid := auth.uid(); mine uuid; added int;
begin
  if me is null then return 0; end if;
  select * into src from public.decks where share_code = code;
  if src.id is null or src.owner_id = me then return 0; end if;
  select id into mine from public.decks where owner_id = me and source_deck_id = src.id order by created_at desc limit 1;
  if mine is null then return 0; end if;
  added := public.update_copy_tree(src.id, mine, me, coalesce(skip, '{}'));
  insert into public.share_events (kind, deck_id, deck_name, from_user, to_user, questions, copy_id)
  values ('updated', src.id, src.name, src.owner_id, me, added, mine);
  return added;
end; $$;

-- Opening a link, logged by the receive screen. Once an hour per person
-- and deck, so reloading the page does not fill the log.
create or replace function public.log_share_open(code text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare src public.decks%rowtype; me uuid := auth.uid();
begin
  if me is null then return; end if;
  select * into src from public.decks where share_code = code;
  if src.id is null or src.owner_id = me then return; end if;
  if exists (select 1 from public.share_events where kind = 'opened' and deck_id = src.id and to_user = me
             and at > now() - interval '1 hour') then return; end if;
  insert into public.share_events (kind, deck_id, deck_name, from_user, to_user)
  values ('opened', src.id, src.name, src.owner_id, me);
end; $$;

-- The swap to a featured deck, logged: inserted before the function's
-- final return, leaving the rest of it (0014, 0016) as it is.
do $$
declare def text := pg_get_functiondef('public.switch_to_featured(uuid)'::regprocedure);
begin
  if position('share_events' in def) = 0 then
    execute replace(def, '  return moved;
end;', '  if moved > 0 then
    insert into share_events (kind, deck_id, deck_name, from_user, to_user, questions, copy_id)
    select ''switched'', f.deck_id, d.name, d.owner_id, me, moved, copy
      from featured_decks f join decks d on d.id = f.deck_id
     where exists (select 1 from _pairs x join generated_questions s on s.id = x.new_id
                   where s.user_id = d.owner_id)
     limit 1;
  end if;
  return moved;
end;');
    if position('share_events' in pg_get_functiondef('public.switch_to_featured(uuid)'::regprocedure)) = 0 then
      raise exception 'switch_to_featured was not updated';
    end if;
  end if;
end $$;

-- The log, for Admin: newest first, with names and emails resolved.
create or replace function public.admin_share_log(lim integer default 300)
returns table (at timestamptz, kind text, deck_name text, from_name text, from_email text,
               to_name text, to_email text, questions integer)
language sql stable security definer set search_path to 'public' as $$
  select e.at, e.kind, e.deck_name,
         nullif(trim(pf.display_name), ''), uf.email::text,
         nullif(trim(pt.display_name), ''), ut.email::text,
         e.questions
  from public.share_events e
  left join public.profiles pf on pf.id = e.from_user
  left join auth.users uf on uf.id = e.from_user
  left join public.profiles pt on pt.id = e.to_user
  left join auth.users ut on ut.id = e.to_user
  where public.is_admin()
  order by e.at desc
  limit lim;
$$;

revoke all on function public.log_share_open(text) from public, anon;
grant execute on function public.log_share_open(text) to authenticated;
revoke all on function public.admin_share_log(integer) from public, anon;
grant execute on function public.admin_share_log(integer) to authenticated;
