-- What students keep reporting, refused at the door (2026-11-17). Questions
-- reach the Resurface decks by several roads (Upload and Edit in the app,
-- bank loads, scripts, the connector), so the check lives on the table,
-- where every one of them has to pass.
--
-- Each report has been one of these:
--   * a wrong option a student could defend: its why_wrong concedes it
--     ("can also", "but not the main one") while the stem never asked for the
--     main one, or it joins a true half to a false one ("Both X and Y…");
--   * a results table with a number and no normal range, or a stem that
--     never says results are shown.
--
-- Only questions in admins' (Resurface) decks are held to it; students' own
-- questions are theirs. An edit is checked only when it changes the stem,
-- options, why_wrong lines or results, so older questions can still have
-- their notes and highlights touched. Copies of existing questions pass.

create or replace function public.question_quality_problems(p jsonb)
returns text[] language plpgsql immutable set search_path = public as $$
declare
  out text[] := '{}';
  q text := coalesce(p->>'q', '');
  ans int := coalesce((p->>'ans')::int, -1);
  n int := case when jsonb_typeof(p->'opts') = 'array' then jsonb_array_length(p->'opts') else 0 end;
  conceded text[] := '{}';
  joined text[] := '{}';
  ex jsonb := p->'exhibit';
  part jsonb;
  r jsonb;
  bare boolean := false;
begin
  if q !~* '\m(most|main(ly)?|primar(y|ily)|principal|first|best|commonest|usual(ly)?|typical(ly)?|initial|definitive|gold|characteristic|likely|key|chief(ly)?|predominant(ly)?|major|preferred|recommended|appropriate|standard|classic(al)?|hallmark|defin(e|es|ed|ing|ition)|specific|direct(ly)?)\M' then
    for i in 0 .. n - 1 loop
      if i <> ans and coalesce(p->'optExp'->>i, '') ~* '\m(can also|(is|are) also (true|correct)|(is|are) true|is correct|also correct|but (it is |is |are )?not the (main|primary|most|best|first|principal|classic|commonest)|but less (common|likely|frequent))\M' then
        conceded := conceded || chr(65 + i);
      end if;
    end loop;
  end if;
  if cardinality(conceded) > 0 then
    out := out || format('The why-wrong for %s admits the option can be true, so there are two right answers. Replace the option with one that is plainly false, or make the stem ask for the most common, main or first-line one.', array_to_string(conceded, ', '));
  end if;

  for i in 0 .. n - 1 loop
    if i <> ans and coalesce(p->'opts'->>i, '') ~* '^\s*both\M' then joined := joined || chr(65 + i); end if;
  end loop;
  if cardinality(joined) > 0 then
    out := out || format('Option %s joins two claims ("Both…"); if either half is true a student can defend it. Make each wrong option one plainly false claim.', array_to_string(joined, ', '));
  end if;

  if ex is not null and jsonb_typeof(ex) in ('object', 'array') then
    for part in select value from jsonb_array_elements(case jsonb_typeof(ex) when 'array' then ex else jsonb_build_array(ex) end) loop
      continue when coalesce(btrim(part->>'note'), '') <> '';
      for r in
        select value from jsonb_array_elements(case when part->>'kind' = 'labs' and jsonb_typeof(part->'rows') = 'array' then part->'rows' else '[]' end)
        union all
        select c.value from jsonb_array_elements(case when part->>'kind' = 'lines' and jsonb_typeof(part->'rows') = 'array' then part->'rows' else '[]' end) l,
             jsonb_array_elements(case when jsonb_typeof(l.value) = 'array' then l.value else '[]' end) c
      loop
        if coalesce(r->>'value', '') ~ '\d' and coalesce(btrim(r->>'range'), '') = '' then bare := true; end if;
      end loop;
    end loop;
    if bare then
      out := out || 'A result has no normal range. Add one, or a note on the block saying the cut-off is what is tested.'::text;
    end if;
    if (q || ' ' || coalesce(p->>'ask', '')) !~* '\m(shown|below|results?|investigations?|bloods?|tests?|levels?|OGTT|gas|aspirate|measured|checked|values?|readings?|table)\M' then
      out := out || 'Results are shown but the stem never says so. Add "Her results are shown." before the question.'::text;
    end if;
  end if;
  return out;
end $$;

create or replace function public.tg_question_quality()
returns trigger language plpgsql security definer set search_path = public as $$
declare problems text[];
begin
  if not exists (select 1 from public.admins a where a.user_id = new.user_id) then return new; end if;
  if tg_op = 'INSERT' and new.source_question_id is not null then return new; end if;
  if tg_op = 'UPDATE'
     and old.payload->'q' is not distinct from new.payload->'q'
     and old.payload->'opts' is not distinct from new.payload->'opts'
     and old.payload->'optExp' is not distinct from new.payload->'optExp'
     and old.payload->'exhibit' is not distinct from new.payload->'exhibit' then
    return new;
  end if;
  problems := public.question_quality_problems(new.payload);
  if cardinality(problems) > 0 then
    raise exception using errcode = 'check_violation',
      message = format('Not saved. "%s": %s', left(coalesce(new.payload->>'q', ''), 90), array_to_string(problems, ' '));
  end if;
  return new;
end $$;

drop trigger if exists question_quality on public.generated_questions;
create trigger question_quality before insert or update of payload on public.generated_questions
  for each row execute function public.tg_question_quality();

revoke all on function public.question_quality_problems(jsonb) from public, anon;
revoke all on function public.tg_question_quality() from public, anon, authenticated;
