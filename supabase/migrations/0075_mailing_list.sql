-- Mailing list emails (2026-11-07). Only people who ticked
-- profiles.marketing_opt_in get these, and every email carries a one-click
-- unsubscribe link, as PECR and UK GDPR require.
--
-- The link carries the user id and a token: an HMAC of the id with the
-- push_secret already in the vault, so links cannot be forged for someone
-- else and nothing new needs storing. marketing_unsubscribe() is the only
-- thing anon can call here, and all it can do is switch one opt-in off.
--
-- mailing_list_send(campaign) sorts the list into three groups by what
-- people have actually done, and posts them to the backend, which picks the
-- email for each group:
--   regular  studied on 4 or more of the last 14 days
--   nudge    has answered something, but less than that
--   never    has never answered a question
-- Our own accounts (public.admins) are left out.

create or replace function public.marketing_unsub_token(u uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select left(encode(extensions.hmac(u::text, (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret'), 'sha256'), 'hex'), 32)
$$;
revoke all on function public.marketing_unsub_token(uuid) from public, anon, authenticated;

create or replace function public.marketing_unsubscribe(u uuid, t text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if t is null or t <> public.marketing_unsub_token(u) then return false; end if;
  update profiles set marketing_opt_in = false where id = u;
  return true;
end $$;
revoke all on function public.marketing_unsubscribe(uuid, text) from public;
grant execute on function public.marketing_unsubscribe(uuid, text) to anon, authenticated;

create or replace function public.mailing_list_send(campaign text) returns int
language plpgsql security definer set search_path = public as $$
declare secret text; people jsonb;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then raise exception 'no secret'; end if;
  with base as (
    select u.id, u.email,
           (select count(distinct day) from activity a where a.user_id = u.id and a.day > current_date - 14) days_14,
           exists (select 1 from activity a where a.user_id = u.id) studied
      from profiles p join auth.users u on u.id = p.id
     where p.marketing_opt_in and u.email is not null
       and u.id not in (select user_id from admins)
  )
  select jsonb_agg(jsonb_build_object(
           'email', email,
           'group', case when days_14 >= 4 then 'regular' when studied then 'nudge' else 'never' end,
           'unsubscribe', format('https://api.tryresurface.com/api/unsubscribe?u=%s&t=%s', id, public.marketing_unsub_token(id))))
    into people from base;
  if people is null then return 0; end if;
  perform net.http_post(
    url := 'https://api.tryresurface.com/api/campaign/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    body := jsonb_build_object('campaign', campaign, 'people', people),
    timeout_milliseconds := 60000
  );
  return jsonb_array_length(people);
end $$;
revoke all on function public.mailing_list_send(text) from public, anon, authenticated;
