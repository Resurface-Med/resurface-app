-- Richer announcements (2026-10-19): a label (New feature, Update, Fix,
-- News) and an optional cover image. Images live in a public bucket that
-- only admins can write to; the page shows them from Storage's CDN.

alter table public.announcements
  add column if not exists tag text check (tag in ('feature', 'update', 'fix', 'news')),
  add column if not exists image_url text check (image_url is null or image_url ~ '^https://');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcements', 'announcements', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 1048576,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

create policy "announcement images: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcements' and public.is_admin());
create policy "announcement images: admins remove" on storage.objects for delete to authenticated
  using (bucket_id = 'announcements' and public.is_admin());

drop function if exists public.admin_post_announcement(text, text);
create function public.admin_post_announcement(p_title text, p_body text, p_tag text default null, p_image text default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare new_id bigint;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into announcements (title, body, tag, image_url, author)
  values (trim(p_title), coalesce(trim(p_body), ''), nullif(p_tag, ''), nullif(p_image, ''), auth.uid())
  returning id into new_id;
  return new_id;
end; $$;
revoke all on function public.admin_post_announcement(text, text, text, text) from public, anon;
grant execute on function public.admin_post_announcement(text, text, text, text) to authenticated;
