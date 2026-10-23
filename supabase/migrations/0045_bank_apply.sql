-- Corrections to a loaded bank (2026-10-23): replace or delete questions
-- in one owner's Principles tree, matched on the question's text. For the
-- mechanical fixes after review (LaTeX, number order) and the deletions
-- Rafil approves. Service role only, through the bank-load edge function.

create or replace function public.bank_apply(me uuid, fixes jsonb, deletes jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  root uuid; nfix int := 0; ndel int := 0; f jsonb; c int;
begin
  select id into root from decks where owner_id = me and parent_id is null and name = 'Principles' and source_deck_id is null;
  if root is null then raise exception 'no Principles deck for this owner'; end if;

  create temp table _tree on commit drop as
    with recursive t as (select root as id union all select d.id from decks d join t on d.parent_id = t.id)
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

revoke all on function public.bank_apply(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bank_apply(uuid, jsonb, jsonb) to service_role;
