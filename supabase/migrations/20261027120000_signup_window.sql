-- (Safe to run more than once.)
-- The sign-up ("I'm in / I'm out") has its own times, separate from when Start playing opens:
--   answers close  rsvp_until_minutes before play time (default 120 = 16:30 for an 18:30 game)
--   the section is hidden for members rsvp_hide_minutes before play time (default 90 = 17:00)
-- Start playing now opens 30 minutes before play time by default (18:00); the old default of 60 is moved to 30.
alter table schedule add column if not exists rsvp_until_minutes int not null default 120;
alter table schedule add column if not exists rsvp_hide_minutes int not null default 90;
alter table schedule alter column opens_minutes set default 30;
update schedule set opens_minutes = 30 where opens_minutes = 60;

create or replace function check_schedule() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.tz) then raise exception 'Unknown time zone: %', new.tz; end if;
  if new.opens_minutes not between 0 and 720 then raise exception 'Opening time must be between 0 and 720 minutes'; end if;
  if new.rsvp_until_minutes not between 0 and 1440 or new.rsvp_hide_minutes not between 0 and 1440 then raise exception 'Sign-up times must be between 0 and 1440 minutes'; end if;
  if new.rsvp_hide_minutes > new.rsvp_until_minutes then raise exception 'The sign-up section cannot be hidden before the answers close'; end if;
  return new;
end $$;

-- may members still answer for this play date? (before the deadline on the play day, always for later days)
create or replace function rsvp_open(d date, at timestamptz default now()) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when d > (at at time zone s.tz)::date then true
    when d < (at at time zone s.tz)::date then false
    else (at at time zone s.tz)::time < s.play_time - make_interval(mins => s.rsvp_until_minutes) end
  from schedule s
$$;

create or replace function guard_rsvp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and not rsvp_open(coalesce(new.day_date, old.day_date)) then
    raise exception 'Answers are closed';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guard_rsvp on rsvps;
create trigger guard_rsvp before insert or update or delete on rsvps for each row execute function guard_rsvp();
