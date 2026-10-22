-- A featured deck can be held back from everyone (2026-10-22).
--
-- listed: every signed-in student sees it. Jacob's Renal stays listed.
-- Unlisted: only the people in featured_audience see it, and the owner
-- does not — they keep editing the original deck, and that is what the
-- audience reads on their next load. A share link would have made a copy
-- that stopped the moment it was taken.
--
-- Rayan's Endo is unlisted and shared with bobpattack only, credited
-- "by Rayan", until it is made public the same way Jacob's is.

alter table public.featured_decks
  add column if not exists listed boolean not null default true;

create table if not exists public.featured_audience (
  deck_id uuid not null references public.featured_decks (deck_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (deck_id, user_id)
);
alter table public.featured_audience enable row level security;
-- No policies. Read only from featured_content(), which checks the caller.

create or replace function public.featured_content()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, f.byline, f.position, f.listed, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5(f.deck_id::text || ':folder')::uuid end top
      from featured_decks f join decks d on d.id = f.deck_id
     where auth.uid() is not null
       and d.owner_id <> auth.uid()
       and (f.listed or exists (
         select 1 from featured_audience a
          where a.deck_id = f.deck_id and a.user_id = auth.uid()
       ))
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.position, d.id root from decks d join roots r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.position, t.root from decks c join tree t on c.parent_id = t.id
  )
  select jsonb_build_object(
    'roots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'top', r.top,
        'byline', coalesce(nullif(trim(r.byline), ''), nullif(trim(p.display_name), ''), 'Someone'),
        'position', r.position,
        'shareCode', case when r.listed then d.share_code else null end,
        'hidden', exists (select 1 from featured_hidden h where h.user_id = auth.uid() and h.deck_id = r.id),
        'copyId', (select c.id from decks c where c.owner_id = auth.uid() and c.source_deck_id = r.id
                    order by c.created_at desc limit 1)
      ) order by r.position)
      from roots r join decks d on d.id = r.id left join profiles p on p.id = d.owner_id), '[]'::jsonb),
    'decks', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', r.top, 'name', r.folder, 'position', 0, 'root', r.id, 'parentId', null) x
          from roots r where r.folder is not null
        union all
        select jsonb_build_object(
          'id', t.id, 'name', coalesce(r.renames ->> t.id::text, t.name), 'position', t.position, 'root', t.root,
          'parentId', case when t.id = t.root then (case when r.folder is null then null else r.top end) else t.parent_id end)
          from tree t join roots r on r.id = t.root
      ) s), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'payload', g.payload, 'deckId', g.deck_id))
      from generated_questions g where g.deck_id in (select id from tree)), '[]'::jsonb)
  );
$$;

-- The extra columns need a new function; replace cannot change the row type.
drop function if exists public.admin_featured_decks();
create function public.admin_featured_decks()
returns table (deck_id uuid, name text, owner_name text, owner_email text, byline text, folder text,
               renames jsonb, "position" integer, questions integer, subdecks jsonb,
               listed boolean, shared_with text)
language sql stable security definer set search_path to 'public' as $$
  select f.deck_id, d.name, nullif(trim(p.display_name), ''), u.email::text, f.byline, f.folder,
         f.renames, f.position, public.deck_tree_questions(f.deck_id),
         (with recursive t as (
            select c.id, c.parent_id, c.name, 1 depth, c.position from decks c where c.parent_id = f.deck_id
            union all select c.id, c.parent_id, c.name, t.depth + 1, c.position from decks c join t on c.parent_id = t.id
          ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'depth', depth) order by depth, position), '[]') from t),
         f.listed,
         (select string_agg(coalesce(nullif(trim(ap.display_name), ''), 'Someone'), ', ' order by ap.display_name)
            from featured_audience a join profiles ap on ap.id = a.user_id
           where a.deck_id = f.deck_id)
  from featured_decks f
  join decks d on d.id = f.deck_id
  left join profiles p on p.id = d.owner_id
  left join auth.users u on u.id = d.owner_id
  where public.is_admin()
  order by f.position, f.created_at;
$$;

create or replace function public.admin_publish_featured(deck uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update featured_decks set listed = true where deck_id = deck;
end; $$;

revoke all on function public.admin_featured_decks() from public, anon;
revoke all on function public.admin_publish_featured(uuid) from public, anon;
grant execute on function public.admin_featured_decks() to authenticated;
grant execute on function public.admin_publish_featured(uuid) to authenticated;

-- Rayan's Endo, for bobpattack only. Fails rather than guessing if either
-- side matches more than one row, or none.
do $$
declare
  viewer uuid;
  owner uuid;
  deck uuid;
  n int;
begin
  select count(*) into n
    from auth.users u
    left join profiles p on p.id = u.id
   where split_part(u.email, '@', 1) ilike 'bobpattack'
      or p.display_name ilike 'bobpattack';
  if n <> 1 then
    raise exception 'expected one account for bobpattack, found %', n;
  end if;
  select u.id into viewer
    from auth.users u
    left join profiles p on p.id = u.id
   where split_part(u.email, '@', 1) ilike 'bobpattack'
      or p.display_name ilike 'bobpattack';

  select count(*) into n
    from profiles p
    join auth.users u on u.id = p.id
   where p.display_name ilike 'rayan'
      or p.display_name ilike 'rayan %'
      or split_part(u.email, '@', 1) ilike 'rayan'
      or split_part(u.email, '@', 1) ilike 'rayan.%'
      or split_part(u.email, '@', 1) ilike 'rayan_%';
  if n <> 1 then
    raise exception 'expected one account for Rayan, found %', n;
  end if;
  select p.id into owner
    from profiles p
    join auth.users u on u.id = p.id
   where p.display_name ilike 'rayan'
      or p.display_name ilike 'rayan %'
      or split_part(u.email, '@', 1) ilike 'rayan'
      or split_part(u.email, '@', 1) ilike 'rayan.%'
      or split_part(u.email, '@', 1) ilike 'rayan_%';

  select count(*) into n
    from decks d
   where d.owner_id = owner
     and d.parent_id is null
     and d.source_deck_id is null
     and d.name ilike 'endocrinology';
  if n <> 1 then
    raise exception 'expected one Endocrinology deck for Rayan, found %', n;
  end if;
  select d.id into deck
    from decks d
   where d.owner_id = owner
     and d.parent_id is null
     and d.source_deck_id is null
     and d.name ilike 'endocrinology';

  insert into featured_decks (deck_id, byline, listed, position)
  values (deck, 'Rayan', false, coalesce((select max(position) + 1 from featured_decks), 0))
  on conflict (deck_id) do update
    set byline = 'Rayan', listed = false;

  insert into featured_audience (deck_id, user_id)
  values (deck, viewer)
  on conflict do nothing;

  delete from featured_audience where deck_id = deck and user_id <> viewer;
end $$;
