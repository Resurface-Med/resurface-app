-- Display names that are not allowed (2026-10-17).
--
-- Names show on the cohort's leaderboard. The same two lists as the app's
-- src/lib/nameFilter.js (generated from it — change both together): words
-- caught anywhere once disguises are undone, and words caught only on their
-- own because their letters also sit inside real names. See that file.
--
-- A name set or changed by someone is refused with a message the app shows.
-- One made up at sign-up (from a Google name or the email address) that
-- fails is replaced with 'Student', and name_chosen cleared so the app asks.
-- Names already set are left as they are.

create or replace function public.name_is_inappropriate(name text)
returns boolean language plpgsql immutable set search_path to '' as $$
declare n text; squashed text; words text; spelled text;
begin
  if name is null then return false; end if;
  n := translate(lower(name), '0134578@$!|', 'oieastbasii');
  squashed := regexp_replace(n, '[^a-z]', '', 'g');
  if squashed ~ '(f+u+c+k+|f+v+c+k+|f+u+k+|m+o+t+h+e+r+f+|s+h+i+t+e+|b+i+t+c+h+|b+a+s+t+a+r+d+|b+o+l+l+o+c+k+|w+a+n+k+e+r+|t+w+a+t+|p+r+i+c+k+|d+i+c+k+h+e+a+d+|c+o+c+k+s+u+c+k+|s+l+u+t+|w+h+o+r+e+|d+i+l+d+o+|j+i+z+z+|b+e+l+l+e+n+d+|n+i+g+g+e+r+|n+i+g+g+a+|f+a+g+g+o+t+|t+r+a+n+n+y+|r+e+t+a+r+d+|n+a+z+i+|h+i+t+l+e+r+|k+k+k+|b+u+m+b+a+c+l+a+t+|b+u+m+b+o+c+l+a+t+|b+u+m+b+a+c+l+o+t+|b+u+m+b+o+c+l+o+t+|b+o+m+b+o+c+l+a+t+|b+l+o+o+d+c+l+a+t+|r+a+s+s+c+l+a+t+|p+u+s+s+y+c+l+a+t+|p+u+s+s+y+|p+o+r+n+|r+a+p+i+s+t+|p+e+d+o+|p+a+e+d+o+|n+o+n+c+e+|b+u+l+l+s+h+i+t+|s+h+i+t+h+e+a+d+|s+h+i+t+f+a+c+e+|d+i+p+s+h+i+t+|h+o+r+s+e+s+h+i+t+|a+s+s+w+i+p+e+|a+r+s+e+w+i+p+e+)' then return true; end if;
  words := btrim(regexp_replace(n, '[^a-z]+', ' ', 'g'));
  if words ~ '(^| )(a+s+s+|a+r+s+e+|a+r+s+e+h+o+l+e+|a+s+s+h+o+l+e+|s+h+i+t+|c+u+n+t+|c+o+c+k+|d+i+c+k+|p+i+s+s+|c+r+a+p+|t+i+t+|t+i+t+s+|b+o+o+b+|b+o+o+b+s+|p+e+n+i+s+|v+a+g+i+n+a+|a+n+a+l+|c+u+m+|s+e+x+|s+e+x+y+|r+a+p+e+|w+a+n+k+|f+a+g+|h+o+m+o+|p+a+k+i+|c+h+i+n+k+|s+p+i+c+|k+i+k+e+|g+o+o+k+|c+o+o+n+|w+o+g+|d+y+k+e+|n+e+g+r+o+|s+p+a+z+|m+o+n+g+|s+l+a+g+|s+k+a+n+k+|t+o+s+s+e+r+|h+o+e+)(s|es|ing|ed|y)?( |$)' then return true; end if;
  spelled := regexp_replace(words, '\m([a-z]) (?=[a-z]\M)', '\1', 'g');
  return spelled <> words and spelled ~ '(^| )(a+s+s+|a+r+s+e+|a+r+s+e+h+o+l+e+|a+s+s+h+o+l+e+|s+h+i+t+|c+u+n+t+|c+o+c+k+|d+i+c+k+|p+i+s+s+|c+r+a+p+|t+i+t+|t+i+t+s+|b+o+o+b+|b+o+o+b+s+|p+e+n+i+s+|v+a+g+i+n+a+|a+n+a+l+|c+u+m+|s+e+x+|s+e+x+y+|r+a+p+e+|w+a+n+k+|f+a+g+|h+o+m+o+|p+a+k+i+|c+h+i+n+k+|s+p+i+c+|k+i+k+e+|g+o+o+k+|c+o+o+n+|w+o+g+|d+y+k+e+|n+e+g+r+o+|s+p+a+z+|m+o+n+g+|s+l+a+g+|s+k+a+n+k+|t+o+s+s+e+r+|h+o+e+)(s|es|ing|ed|y)?( |$)';
end; $$;

create or replace function public.guard_display_name()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.display_name is distinct from coalesce(case when tg_op = 'UPDATE' then old.display_name end, '')
     and public.name_is_inappropriate(new.display_name) then
    if tg_op = 'INSERT' then
      new.display_name := 'Student';
      new.name_chosen := false;
    else
      raise exception 'That name isn''t allowed, as it shows on the leaderboard. Choose another.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists guard_display_name on public.profiles;
create trigger guard_display_name before insert or update of display_name on public.profiles
  for each row execute function public.guard_display_name();
