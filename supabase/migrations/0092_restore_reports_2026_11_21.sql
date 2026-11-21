-- The two reports resolved today, before 0091 kept them (2026-11-21).
--
-- Rafil asked for the new "we fixed it" popup to reach the people who had
-- reported recently. Resolving deleted reports until 0091, so they are
-- rebuilt from what is left: the API request logs (kept 24 hours) show each
-- report's student and time, and the student's answer_log gives the
-- question they had just answered (Report only appears after answering).
-- Both questions were edited afterwards:
--   15:47:34  question 11260 (gene regulation), answered 15:46:49, edited 17:31
--   16:17:39  question 23749 (prostaglandins and sleep), answered 16:17:21, edited 17:28
-- The logs do not keep the reason, so it is 'unknown', and the popup leaves
-- the reason line out. Anything older than the logs' 24 hours is gone.

alter table public.question_flags drop constraint if exists question_flags_reason_check;
alter table public.question_flags add constraint question_flags_reason_check
  check (reason = any (array['wrong-answer', 'bad-explanation', 'unclear', 'duplicate', 'other', 'unknown']));

select set_config('resurface.flag_admin', '1', true);
insert into public.question_flags (user_id, question_id, reason, created_at, resolved_at, stem)
select v.user_id, v.question_id, 'unknown', v.created_at, now(), g.payload->>'q'
  from (values
    ('27f75dc4-e38d-4af3-9af5-0ddfb89b7ecc'::uuid, 1011260, '2026-11-21 15:47:34+00'::timestamptz),
    ('7e8b46ba-42e5-4029-a653-3716ec73d94b'::uuid, 1023749, '2026-11-21 16:17:39+00'::timestamptz)
  ) v(user_id, question_id, created_at)
  left join public.generated_questions g on g.id = v.question_id - 1000000
on conflict (user_id, question_id) do nothing;
select set_config('resurface.flag_admin', '', true);
