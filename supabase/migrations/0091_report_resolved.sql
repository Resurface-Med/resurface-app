-- "Thanks, we fixed the question you reported" (2026-11-21).
--
-- A student who reports a question hears back once it's dealt with. Rafil:
-- say we fixed it whatever happened, fixed, judged fine or deleted, so
-- reporting feels worth it. Before this a resolved report was deleted
-- (admin_clear_flags), so there was nothing left to tell anyone about.
--
-- A report is now kept and marked:
--   resolved_at  when an admin resolved it (app's Admin, or resolve_reports
--                in the Claude connector), or when its question was deleted
--   seen_at      when the student saw the popup
--   stem         the question as they reported it, so the popup still has
--                something to show once the question is gone
--
-- Reporting the same question again (the app upserts, with a new
-- created_at) reopens it. Only these functions may set resolved_at or
-- seen_at; a student's own update through the table cannot.

alter table public.question_flags
  add column if not exists resolved_at timestamptz,
  add column if not exists seen_at timestamptz,
  add column if not exists stem text;

create index if not exists question_flags_unseen
  on public.question_flags (user_id) where resolved_at is not null and seen_at is null;

create or replace function public.tg_question_flag_keep()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if current_setting('resurface.flag_admin', true) = '1' then return new; end if;
  if tg_op = 'INSERT' or new.created_at is distinct from old.created_at then
    new.resolved_at := null;
    new.seen_at := null;
    new.stem := coalesce(
      (select g.payload->>'q' from generated_questions g where g.id = new.question_id - 1000000),
      case when tg_op = 'UPDATE' then old.stem end);
  else
    new.resolved_at := old.resolved_at;
    new.seen_at := old.seen_at;
    new.stem := old.stem;
  end if;
  return new;
end $$;

drop trigger if exists question_flag_keep on public.question_flags;
create trigger question_flag_keep before insert or update on public.question_flags
  for each row execute function public.tg_question_flag_keep();

-- Open reports only, for Admin and the connector's list_reports.
create or replace function public.admin_flags()
returns table(question_id integer, flags bigint, reasons text[], notes text[], last_flagged timestamptz, reporters jsonb)
language sql stable security definer set search_path to 'public' as $function$
  select f.question_id,
         count(*),
         array_agg(distinct f.reason),
         array_remove(array_agg(f.note order by f.created_at desc), null),
         max(f.created_at),
         jsonb_agg(
           jsonb_build_object(
             'name', nullif(btrim(p.display_name), ''),
             'email', u.email::text,
             'note', nullif(btrim(f.note), '')
           )
           order by f.created_at desc
         )
  from public.question_flags f
  left join public.profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  where public.is_admin() and f.resolved_at is null
  group by f.question_id
  order by max(f.created_at) desc
$function$;

-- Resolve rather than delete. Dropped first: it was language sql.
drop function if exists public.admin_clear_flags(integer);
create function public.admin_clear_flags(qid integer)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then return; end if;
  perform set_config('resurface.flag_admin', '1', true);
  update public.question_flags set resolved_at = now()
   where question_id = qid and resolved_at is null;
  perform set_config('resurface.flag_admin', '', true);
end $$;
revoke all on function public.admin_clear_flags(integer) from public, anon;
grant execute on function public.admin_clear_flags(integer) to authenticated;

-- A deleted question resolves everyone's reports on it, keeping the wording.
-- The owner's own reports on their own question still just go, as before:
-- nobody needs thanking for flagging a question they then deleted.
create or replace function public.cleanup_question_progress()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  qid bigint := old.id + 1000000;
begin
  delete from public.practice_stats where user_id = old.user_id and question_id = qid;
  delete from public.sr_cards       where user_id = old.user_id and question_id = qid;
  delete from public.bookmarks      where user_id = old.user_id and question_id = qid;
  delete from public.question_flags where user_id = old.user_id and question_id = qid;
  perform set_config('resurface.flag_admin', '1', true);
  update public.question_flags
     set resolved_at = now(), stem = coalesce(stem, old.payload->>'q')
   where question_id = qid and resolved_at is null;
  perform set_config('resurface.flag_admin', '', true);
  return old;
end;
$function$;

-- What the popup shows: this person's resolved reports they haven't seen.
create or replace function public.my_resolved_reports()
returns table(question_id integer, reason text, stem text, resolved_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select f.question_id, f.reason,
         coalesce((select g.payload->>'q' from generated_questions g where g.id = f.question_id - 1000000), f.stem),
         f.resolved_at
    from public.question_flags f
   where f.user_id = auth.uid() and f.resolved_at is not null and f.seen_at is null
   order by f.resolved_at
   limit 20
$$;

create or replace function public.mark_reports_seen(qids integer[])
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform set_config('resurface.flag_admin', '1', true);
  update public.question_flags set seen_at = now()
   where user_id = auth.uid() and question_id = any(qids) and resolved_at is not null and seen_at is null;
  perform set_config('resurface.flag_admin', '', true);
end $$;

revoke all on function public.my_resolved_reports() from public, anon;
revoke all on function public.mark_reports_seen(integer[]) from public, anon;
grant execute on function public.my_resolved_reports() to authenticated;
grant execute on function public.mark_reports_seen(integer[]) to authenticated;
revoke all on function public.tg_question_flag_keep() from public, anon, authenticated;
