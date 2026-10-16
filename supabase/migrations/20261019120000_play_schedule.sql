-- (Safe to run more than once.)
-- Play schedule: regular members can only start a day on the play day, from 1 hour before the play time until midnight.
-- Admins can start a day at any time. Edit the single row below (as an admin / in the SQL editor) to change the schedule.

create table if not exists schedule (
  id boolean primary key default true check (id),            -- one row only
  tz text not null default 'Europe/Berlin',
  dow int not null default 4 check (dow between 0 and 6),    -- 0 = Sunday ... 4 = Thursday
  play_time time not null default '18:30',
  opens_minutes int not null default 60                      -- how long before play_time starting opens
);
insert into schedule default values on conflict do nothing;
alter table schedule enable row level security;
drop policy if exists "members read" on schedule;
create policy "members read" on schedule for select to authenticated using (true);
drop policy if exists "admin edit" on schedule;
create policy "admin edit" on schedule for update to authenticated using (is_admin()) with check (is_admin());

create or replace function can_start_now(at timestamptz default now()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from schedule s
    where extract(dow from (at at time zone s.tz)) = s.dow
      and (at at time zone s.tz)::time >= s.play_time - make_interval(mins => s.opens_minutes))
$$;

create or replace function guard_day() returns trigger language plpgsql as $$
begin
  if (new.closed is distinct from old.closed                       -- close / reopen
      or (old.started and not new.started)                         -- reset day
      or (old.photo_path is not null and new.photo_path is null))  -- delete photo
     and not is_admin() then
    raise exception 'Admins only';
  end if;
  if not old.started and new.started and not is_admin() and not can_start_now() then
    raise exception 'A day can only be started during the play window. Ask an admin.';
  end if;
  return new;
end $$;

-- members may only create days that are not started yet (starting goes through the guard above)
drop policy if exists "members add" on days;
drop policy if exists "members add unstarted" on days;
create policy "members add unstarted" on days for insert to authenticated with check (not started or is_admin());
