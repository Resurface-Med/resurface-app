-- Editing an announcement (2026-10-19): title, text, label and cover, for
-- drafts and published posts alike. Editing does not change when it was
-- published, so it does not count as new again.
create or replace function public.admin_update_announcement(p_id bigint, p_title text, p_body text,
                                                            p_tag text default null, p_image text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update announcements
     set title = trim(p_title), body = coalesce(trim(p_body), ''), tag = nullif(p_tag, ''), image_url = nullif(p_image, '')
   where id = p_id;
end; $$;
revoke all on function public.admin_update_announcement(bigint, text, text, text, text) from public, anon;
grant execute on function public.admin_update_announcement(bigint, text, text, text, text) to authenticated;
