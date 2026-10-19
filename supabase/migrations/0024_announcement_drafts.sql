-- Announcement drafts (2026-10-19): a post is written as a draft that only
-- admins can see, checked on the real page, then published. published_at
-- is when everyone got it — what the page orders by and what the badge
-- counts from — so a post drafted on Monday and published on Friday is new
-- on Friday. Null means a draft.

alter table public.announcements add column if not exists published_at timestamptz;
update public.announcements set published_at = created_at where published_at is null;

drop policy if exists "announcements readable when signed in" on public.announcements;
create policy "published announcements readable; drafts by admins" on public.announcements
  for select to authenticated using (published_at is not null or public.is_admin());

drop function if exists public.admin_post_announcement(text, text, text, text);
create function public.admin_post_announcement(p_title text, p_body text, p_tag text default null,
                                               p_image text default null, p_publish boolean default false)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare new_id bigint;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into announcements (title, body, tag, image_url, author, published_at)
  values (trim(p_title), coalesce(trim(p_body), ''), nullif(p_tag, ''), nullif(p_image, ''), auth.uid(),
          case when p_publish then now() end)
  returning id into new_id;
  return new_id;
end; $$;

create or replace function public.admin_set_announcement_published(p_id bigint, p_publish boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update announcements set published_at = case when p_publish then now() end where id = p_id;
end; $$;

revoke all on function public.admin_post_announcement(text, text, text, text, boolean) from public, anon;
revoke all on function public.admin_set_announcement_published(bigint, boolean) from public, anon;
grant execute on function public.admin_post_announcement(text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_set_announcement_published(bigint, boolean) to authenticated;
