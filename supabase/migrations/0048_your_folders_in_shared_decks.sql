-- Your own folders inside a ready-made deck, and suggesting them for
-- everyone (Rafil, 2026-10-23).
--
-- A student may put a deck of theirs inside a ready-made (featured) deck:
-- decks.parent_id points into Jacob's tree, the row stays theirs. So every
-- walk down a deck tree now follows only decks with the root's owner — or
-- one student's folder would be served to everyone (featured_content),
-- counted against the publish gate, or copied into someone's share.

-- ── Trees stop at someone else's deck ─────────────────────────────────

create or replace function public.deck_tree_questions(root uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  with recursive t as (
    select id, owner_id from decks where id = root
    union all select d.id, d.owner_id from decks d join t on d.parent_id = t.id and d.owner_id = t.owner_id
  )
  select count(*)::int from generated_questions g where g.deck_id in (select id from t);
$$;

create or replace function public.is_featured_question(qid bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  with recursive t as (
    select f.deck_id id, d.owner_id from featured_decks f join decks d on d.id = f.deck_id
    union all select d.id, d.owner_id from decks d join t on d.parent_id = t.id and d.owner_id = t.owner_id
  )
  select exists (select 1 from generated_questions g where g.id = qid and g.deck_id in (select id from t));
$$;

create or replace function public.shared_questions(code text)
returns table(id bigint, q text, a text) language sql stable security definer set search_path to 'public' as $$
  with recursive tree as (
    select d.id, d.owner_id from public.decks d where d.share_code = code and auth.uid() is not null
    union all
    select c.id, c.owner_id from public.decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
  )
  select g.id, g.payload->>'q', g.payload->'opts'->>((g.payload->>'ans')::int)
  from public.generated_questions g where g.deck_id in (select id from tree);
$$;

create or replace function public.deck_preview(code text)
returns table(name text, questions bigint, decks bigint, owner_name text, mine boolean, copy_id uuid, new_questions bigint)
language sql stable security definer set search_path to 'public' as $$
  with recursive src as (
    select d.id, d.name, d.owner_id from public.decks d
     where d.share_code = code and auth.uid() is not null
  ),
  tree as (
    select id, owner_id from src
    union all
    select c.id, c.owner_id from public.decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
  ),
  my_copy as (
    select d.id from public.decks d, src
     where d.owner_id = auth.uid() and d.source_deck_id = src.id
     order by d.created_at desc limit 1
  )
  select
    s.name,
    (select count(*) from public.generated_questions g where g.deck_id in (select id from tree)),
    (select count(*) from tree) - 1,
    coalesce(nullif(trim(p.display_name), ''), 'Someone'),
    s.owner_id = auth.uid(),
    (select id from my_copy),
    (select count(*) from public.generated_questions g
      where g.deck_id in (select id from tree)
        and not exists (select 1 from public.generated_questions m
                         where m.user_id = auth.uid() and m.source_question_id = g.id))
  from src s left join public.profiles p on p.id = s.owner_id;
$$;

create or replace function public.copy_deck_tree(src_id uuid, new_owner uuid, new_parent uuid, skip bigint[] default '{}'::bigint[])
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare src public.decks%rowtype; new_id uuid; child record;
begin
  select * into src from public.decks where id = src_id;
  insert into public.decks (owner_id, parent_id, name, position, source_deck_id)
    values (new_owner, new_parent, src.name, src.position, src.id) returning id into new_id;
  insert into public.generated_questions (user_id, payload, deck_id, source_question_id)
    select new_owner, payload, new_id, id from public.generated_questions
     where deck_id = src_id and not (id = any (skip));
  for child in select id from public.decks where parent_id = src_id and owner_id = src.owner_id order by position, created_at loop
    perform public.copy_deck_tree(child.id, new_owner, new_id, skip);
  end loop;
  return new_id;
end; $$;

create or replace function public.update_copy_tree(src_id uuid, copy_id uuid, me uuid, skip bigint[] default '{}'::bigint[])
returns integer language plpgsql security definer set search_path to 'public' as $$
declare added int := 0; n int; child record; sub uuid; src_owner uuid;
begin
  select owner_id into src_owner from public.decks where id = src_id;
  insert into public.generated_questions (user_id, payload, deck_id, source_question_id)
    select me, g.payload, copy_id, g.id from public.generated_questions g
     where g.deck_id = src_id and not (g.id = any (skip))
       and not exists (select 1 from public.generated_questions m where m.user_id = me and m.source_question_id = g.id);
  get diagnostics n = row_count; added := added + n;
  for child in select id, name, position from public.decks where parent_id = src_id and owner_id = src_owner order by position, created_at loop
    select id into sub from public.decks where owner_id = me and source_deck_id = child.id order by created_at desc limit 1;
    if sub is null then
      insert into public.decks (owner_id, parent_id, name, position, source_deck_id)
        values (me, copy_id, child.name, child.position, child.id) returning id into sub;
    end if;
    added := added + public.update_copy_tree(child.id, sub, me, skip);
  end loop;
  return added;
end; $$;

create or replace function public.admin_publish_featured(deck uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare waiting int;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  with recursive t as (
    select id, owner_id from decks where id = deck
    union all select d.id, d.owner_id from decks d join t on d.parent_id = t.id and d.owner_id = t.owner_id
  )
  select count(*) into waiting from generated_questions g
   where g.deck_id in (select id from t)
     and not exists (select 1 from question_reviews r where r.question_id = g.id and r.status = 'approved');
  if waiting > 0 then
    raise exception '% questions in this deck are not approved yet', waiting;
  end if;
  update featured_decks set listed = true where deck_id = deck;
end $$;

create or replace function public.bank_apply(me uuid, fixes jsonb, deletes jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  root uuid; nfix int := 0; ndel int := 0; f jsonb; c int;
begin
  select id into root from decks where owner_id = me and parent_id is null and name = 'Principles' and source_deck_id is null;
  if root is null then raise exception 'no Principles deck for this owner'; end if;

  create temp table _tree on commit drop as
    with recursive t as (select root as id union all select d.id from decks d join t on d.parent_id = t.id and d.owner_id = me)
    select id from t;

  for f in select * from jsonb_array_elements(coalesce(fixes, '[]')) loop
    update generated_questions set payload = f->'new'
     where deck_id in (select id from _tree) and payload->>'q' = f->>'old';
    get diagnostics c = row_count; nfix := nfix + c;
  end loop;

  delete from generated_questions
   where deck_id in (select id from _tree)
     and payload->>'q' in (select jsonb_array_elements_text(coalesce(deletes, '[]')));
  get diagnostics ndel = row_count;

  return jsonb_build_object('fixed', nfix, 'deleted', ndel);
end $$;

create or replace function public.featured_content()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with recursive roots as (
    select f.deck_id id, f.byline, f.position, f.listed, nullif(trim(f.folder), '') folder, f.renames,
           case when nullif(trim(f.folder), '') is null then f.deck_id
                else md5('featured-folder:' || lower(trim(f.folder)))::uuid end top
      from featured_decks f join decks d on d.id = f.deck_id
     where auth.uid() is not null
       and d.owner_id <> auth.uid()
       and (f.listed or exists (
         select 1 from featured_audience a
          where a.deck_id = f.deck_id and a.user_id = auth.uid()
       ))
  ),
  tree as (
    select d.id, d.parent_id, d.name, d.position, d.id root, d.owner_id from decks d join roots r on r.id = d.id
    union all
    select c.id, c.parent_id, c.name, c.position, t.root, c.owner_id from decks c join tree t on c.parent_id = t.id and c.owner_id = t.owner_id
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
          'id', t.id, 'name', coalesce(r.renames ->> t.id::text, t.name),
          'position', case when t.id = t.root then r.position else t.position end,
          'root', t.root,
          'parentId', case when t.id = t.root then (case when r.folder is null then null else r.top end) else t.parent_id end)
          from tree t join roots r on r.id = t.root
      ) s), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'payload', g.payload, 'deckId', g.deck_id))
      from generated_questions g where g.deck_id in (select id from tree)), '[]'::jsonb)
  );
$$;

create or replace function public.admin_featured_decks()
returns table(deck_id uuid, name text, owner_name text, owner_email text, byline text, folder text, renames jsonb, "position" integer, questions integer, subdecks jsonb, listed boolean, shared_with text)
language sql stable security definer set search_path to 'public' as $$
  select f.deck_id, d.name, nullif(trim(p.display_name), ''), u.email::text, f.byline, f.folder,
         f.renames, f.position, public.deck_tree_questions(f.deck_id),
         (with recursive t as (
            select c.id, c.parent_id, c.name, 1 depth, c.position from decks c where c.parent_id = f.deck_id and c.owner_id = d.owner_id
            union all select c.id, c.parent_id, c.name, t.depth + 1, c.position from decks c join t on c.parent_id = t.id and c.owner_id = d.owner_id
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

-- ── Where a deck may go ───────────────────────────────────────────────

/* The featured deck a deck sits in, walking up through its owner's decks:
   null when it is not inside one. */
create or replace function public.featured_root_of(deck uuid)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare cur uuid := deck; own uuid; o uuid; p uuid; hops int := 0;
begin
  select owner_id into own from decks where id = deck;
  while cur is not null and hops < 100 loop
    select owner_id, parent_id into o, p from decks where id = cur;
    if o is distinct from own then return null; end if;
    if exists (select 1 from featured_decks where deck_id = cur) then return cur; end if;
    cur := p;
    hops := hops + 1;
  end loop;
  return null;
end $$;

/* Your deck goes under your own deck, or inside a ready-made deck you can
   see. Not inside anyone else's. */
create or replace function public.check_deck_parent()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare parent_owner uuid; root uuid;
begin
  if new.parent_id is null then return new; end if;
  select owner_id into parent_owner from decks where id = new.parent_id;
  if parent_owner is null or parent_owner = new.owner_id then return new; end if;
  root := public.featured_root_of(new.parent_id);
  if root is not null and exists (
    select 1 from featured_decks f where f.deck_id = root
       and (f.listed or exists (select 1 from featured_audience a where a.deck_id = root and a.user_id = new.owner_id))
  ) then return new; end if;
  raise exception 'That deck is not yours to put things in.';
end $$;

drop trigger if exists check_deck_parent on public.decks;
create trigger check_deck_parent before insert or update of parent_id on public.decks
  for each row execute function public.check_deck_parent();

/* Someone else's folder inside a deck that is deleted goes to their top
   level instead of with it. */
create or replace function public.rescue_foreign_children()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update decks set parent_id = null where parent_id = old.id and owner_id <> old.owner_id;
  return old;
end $$;

drop trigger if exists rescue_foreign_children on public.decks;
create trigger rescue_foreign_children before delete on public.decks
  for each row execute function public.rescue_foreign_children();

-- ── Suggesting a folder for everyone ─────────────────────────────────

create table if not exists public.deck_suggestions (
  id bigint generated always as identity primary key,
  deck_id uuid not null unique references public.decks(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.deck_suggestions enable row level security;

create table if not exists public.suggestion_outcomes (
  question_id bigint primary key references public.generated_questions(id) on delete cascade,
  suggestion_id bigint not null references public.deck_suggestions(id) on delete cascade,
  status text not null check (status in ('added', 'kept')),
  reason text check (char_length(reason) <= 1000),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now()
);
alter table public.suggestion_outcomes enable row level security;
create index if not exists suggestion_outcomes_sid on public.suggestion_outcomes(suggestion_id);

/* The deck a folder's questions would join: the one it sits in that is
   not the author's. */
create or replace function public.suggestion_target(deck uuid)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare cur uuid; own uuid; p uuid; hops int := 0;
begin
  select owner_id, parent_id into own, p from decks where id = deck;
  cur := deck;
  while p is not null and hops < 100 loop
    if (select owner_id from decks where id = p) <> own then return p; end if;
    cur := p;
    select parent_id into p from decks where id = cur;
    hops := hops + 1;
  end loop;
  return null;
end $$;

create or replace function public.suggest_deck(deck uuid, note text default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); sid bigint;
begin
  if me is null or not exists (select 1 from decks where id = deck and owner_id = me) then raise exception 'not allowed'; end if;
  if public.suggestion_target(deck) is null then raise exception 'Put this folder inside a ready-made deck first.'; end if;
  insert into deck_suggestions (deck_id, author, note) values (deck, me, nullif(trim(note), ''))
  on conflict (deck_id) do update set note = excluded.note, created_at = now()
  returning id into sid;
  return sid;
end $$;

create or replace function public.withdraw_suggestion(deck uuid)
returns void language sql security definer set search_path to 'public' as $$
  delete from deck_suggestions where deck_id = deck and author = auth.uid();
$$;

/* Questions of a suggestion still in the author's folder (waiting or kept). */
create or replace function public.suggestion_questions(sid bigint)
returns table(id bigint, payload jsonb, deck_id uuid, status text, reason text)
language sql stable security definer set search_path to 'public' as $$
  with recursive s as (select deck_id, author from deck_suggestions where id = sid),
  t as (
    select d.id from decks d join s on d.id = s.deck_id
    union all select d.id from decks d join t on d.parent_id = t.id join s on d.owner_id = s.author
  )
  select g.id, g.payload, g.deck_id, o.status, o.reason
    from generated_questions g left join suggestion_outcomes o on o.question_id = g.id
   where g.deck_id in (select id from t)
   order by g.id;
$$;
revoke all on function public.suggestion_questions(bigint) from public, anon, authenticated;

create or replace function public.my_suggestions()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'deckId', s.deck_id, 'at', s.created_at, 'note', s.note,
    'added', (select count(*) from suggestion_outcomes o where o.suggestion_id = s.id and o.status = 'added'),
    'waiting', (select count(*) from public.suggestion_questions(s.id) x where x.status is null),
    'kept', (select coalesce(jsonb_agg(jsonb_build_object('qid', x.id, 'q', x.payload->>'q', 'reason', x.reason)), '[]')
               from public.suggestion_questions(s.id) x where x.status = 'kept')
  )), '[]'::jsonb)
  from deck_suggestions s where s.author = auth.uid();
$$;

create or replace function public.admin_suggestions()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'deckId', s.deck_id, 'deckName', d.name,
    'target', public.suggestion_target(s.deck_id),
    'by', coalesce(nullif(trim(p.display_name), ''), 'Someone'),
    'note', s.note, 'at', s.created_at,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'payload', x.payload, 'status', x.status, 'reason', x.reason)), '[]')
                    from public.suggestion_questions(s.id) x),
    'added', (select count(*) from suggestion_outcomes o where o.suggestion_id = s.id and o.status = 'added')
  ) order by s.created_at), '[]'::jsonb)
  from deck_suggestions s join decks d on d.id = s.deck_id left join profiles p on p.id = s.author
  where public.is_admin();
$$;

/* Add a suggested question to the deck for everyone (it moves there, keeping
   its id, so the author's progress on it carries over), or keep it out. */
create or replace function public.admin_suggestion_decide(qid bigint, accept boolean, why text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare sid bigint; target uuid; towner uuid; author_name text; cur uuid; hops int := 0;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select deck_id into cur from generated_questions where id = qid;
  while cur is not null and sid is null and hops < 100 loop
    select id into sid from deck_suggestions where deck_id = cur;
    if sid is null then select parent_id into cur from decks where id = cur; end if;
    hops := hops + 1;
  end loop;
  if sid is null then raise exception 'not a suggested question'; end if;

  if accept then
    select public.suggestion_target(s.deck_id), coalesce(nullif(trim(p.display_name), ''), 'Someone')
      into target, author_name
      from deck_suggestions s left join profiles p on p.id = s.author where s.id = sid;
    if target is null then raise exception 'this folder is no longer in a ready-made deck'; end if;
    select owner_id into towner from decks where id = target;
    update generated_questions
       set user_id = towner, deck_id = target, payload = payload || jsonb_build_object('suggestedBy', author_name)
     where id = qid;
    insert into question_reviews (question_id, status, reviewer, updated_at) values (qid, 'approved', auth.uid(), now())
    on conflict (question_id) do update set status = 'approved', reviewer = auth.uid(), updated_at = now();
  end if;

  insert into suggestion_outcomes (question_id, suggestion_id, status, reason, decided_by)
  values (qid, sid, case when accept then 'added' else 'kept' end, case when accept then null else nullif(trim(why), '') end, auth.uid())
  on conflict (question_id) do update set status = excluded.status, reason = excluded.reason, decided_by = excluded.decided_by, decided_at = now();
end $$;

revoke all on function public.admin_suggestions() from public, anon;
revoke all on function public.admin_suggestion_decide(bigint, boolean, text) from public, anon;
revoke all on function public.suggest_deck(uuid, text) from public, anon;
revoke all on function public.withdraw_suggestion(uuid) from public, anon;
revoke all on function public.my_suggestions() from public, anon;
grant execute on function public.admin_suggestions(), public.admin_suggestion_decide(bigint, boolean, text),
  public.suggest_deck(uuid, text), public.withdraw_suggestion(uuid), public.my_suggestions() to authenticated;
