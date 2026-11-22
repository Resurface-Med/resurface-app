-- One request for an answer's writes (2026-11-22).
--
-- Each answer sent five to seven requests: the answer log, the option
-- picked, practice_stats, sr_cards, activity, the streak and the session,
-- plus study time every 15 s. lib/remote now gathers the writes made within
-- a moment of each other and sends them here together. Each kind is written
-- exactly as its own request wrote it; user_id is always the caller's, never
-- the request's. All or nothing: if any fails, the app sends them one by one
-- the old way, which knows which to retry and which to drop.

create or replace function public.write_batch(ops jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  o jsonb;
  r jsonb;
  n integer := 0;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(ops) is distinct from 'array' or jsonb_array_length(ops) > 300 then
    raise exception 'write_batch takes an array of at most 300' using errcode = '22023';
  end if;
  for o in select value from jsonb_array_elements(ops) loop
    r := o->'r';
    case o->>'k'
      when 'practice' then
        insert into practice_stats (user_id, question_id, correct, total, updated_at)
        values (uid, (r->>'question_id')::int, (r->>'correct')::int, (r->>'total')::int, now())
        on conflict (user_id, question_id) do update
          set correct = excluded.correct, total = excluded.total, updated_at = excluded.updated_at;
      when 'pick' then
        insert into option_picks (user_id, question_id, option_text, option_index)
        values (uid, (r->>'question_id')::int, r->>'option_text', (r->>'option_index')::smallint)
        on conflict (user_id, question_id) do nothing;
      when 'answer' then
        insert into answer_log (user_id, question_id, correct, ms, at)
        values (uid, (r->>'question_id')::int, (r->>'correct')::boolean, (r->>'ms')::int, (r->>'at')::timestamptz);
      when 'sr' then
        insert into sr_cards (user_id, question_id, interval, repetitions, ease_factor, lapses, due_date, interval_minutes, updated_at)
        values (uid, (r->>'question_id')::int, coalesce((r->>'interval')::int, 0), coalesce((r->>'repetitions')::int, 0),
                coalesce((r->>'ease_factor')::numeric, 2.5), coalesce((r->>'lapses')::int, 0),
                (r->>'due_date')::timestamptz, (r->>'interval_minutes')::int, now())
        on conflict (user_id, question_id) do update
          set interval = excluded.interval, repetitions = excluded.repetitions, ease_factor = excluded.ease_factor,
              lapses = excluded.lapses, due_date = excluded.due_date, interval_minutes = excluded.interval_minutes,
              updated_at = excluded.updated_at;
      when 'activity' then
        insert into activity (user_id, day, count)
        values (uid, (r->>'day')::date, (r->>'count')::int)
        on conflict (user_id, day) do update set count = excluded.count;
      when 'streak' then
        insert into streaks (user_id, current, longest, last_date, updated_at)
        values (uid, (r->>'current')::int, (r->>'longest')::int, (r->>'last_date')::date, now())
        on conflict (user_id) do update
          set current = excluded.current, longest = excluded.longest, last_date = excluded.last_date, updated_at = excluded.updated_at;
      when 'study-time' then
        if (r->>'secs')::bigint between 0 and 100000000 then
          update profiles set study_seconds = greatest(study_seconds, (r->>'secs')::bigint), updated_at = now() where id = uid;
        end if;
      when 'session-save' then
        insert into practice_sessions (id, user_id, label, items, idx, total, answered, correct, finished, created_at, updated_at)
        values ((r->>'id')::uuid, uid, coalesce(r->>'label', ''), coalesce(r->'items', '[]'::jsonb),
                coalesce((r->>'idx')::int, 0), coalesce((r->>'total')::int, 0), coalesce((r->>'answered')::int, 0),
                coalesce((r->>'correct')::int, 0), coalesce((r->>'finished')::boolean, false),
                coalesce((r->>'created_at')::timestamptz, now()), coalesce((r->>'updated_at')::timestamptz, now()))
        on conflict (id) do update
          set label = excluded.label, items = excluded.items, idx = excluded.idx, total = excluded.total,
              answered = excluded.answered, correct = excluded.correct, finished = excluded.finished,
              created_at = excluded.created_at, updated_at = excluded.updated_at
          where practice_sessions.user_id = uid;
      else
        raise exception 'write_batch: unknown kind %', o->>'k' using errcode = '22023';
    end case;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.write_batch(jsonb) from public, anon;
grant execute on function public.write_batch(jsonb) to authenticated;
