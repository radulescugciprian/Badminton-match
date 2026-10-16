-- (Safe to run more than once.)
-- Personal settings (language, share stats) and a safer play-schedule editor.

alter table profiles add column if not exists lang text not null default 'en';
alter table profiles drop constraint if exists profiles_lang_check;
alter table profiles add constraint profiles_lang_check check (lang in ('en', 'ro', 'hr', 'sv'));
alter table profiles add column if not exists share_stats boolean not null default true;

-- everyone may change their own settings; the guard below keeps them from touching anything else
drop policy if exists "own settings" on profiles;
create policy "own settings" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function guard_profile() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not is_admin()
     and (new.is_admin is distinct from old.is_admin or new.username is distinct from old.username
          or new.name is distinct from old.name or new.id is distinct from old.id) then
    raise exception 'Admins only';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on profiles;
create trigger guard_profile before update on profiles for each row execute function guard_profile();

-- the schedule editor in the app: refuse unknown time zones (an invalid one would break "start a day" for everyone)
create or replace function check_schedule() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.tz) then raise exception 'Unknown time zone: %', new.tz; end if;
  if new.opens_minutes not between 0 and 720 then raise exception 'Opening time must be between 0 and 720 minutes'; end if;
  return new;
end $$;
drop trigger if exists check_schedule on schedule;
create trigger check_schedule before insert or update on schedule for each row execute function check_schedule();
