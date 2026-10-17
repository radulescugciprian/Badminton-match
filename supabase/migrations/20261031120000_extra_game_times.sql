-- (Safe to run more than once.)
-- An extra game has its own start time and its own deadline for answers, set by whoever adds it.
alter table play_dates add column if not exists play_time time;
alter table play_dates add column if not exists answer_by timestamptz;
create or replace function check_play_date() returns trigger language plpgsql as $$
begin
  if new.answer_by is not null and new.play_time is not null
     and new.answer_by > (new.day + new.play_time) at time zone (select tz from schedule) then
    raise exception 'The answer deadline must be before the game';
  end if;
  return new;
end $$;
drop trigger if exists check_play_date on play_dates;
create trigger check_play_date before insert or update on play_dates for each row execute function check_play_date();

-- members must give both when they add an extra game
drop policy if exists "members add extra games" on play_dates;
create policy "members add extra games" on play_dates for insert to authenticated
  with check (kind = 'extra' and created_by = auth.uid() and play_time is not null and answer_by is not null
              and day >= (now() at time zone (select tz from schedule))::date
              and extract(dow from day) <> (select dow from schedule));

-- the start time of a play day: the extra game's own time, otherwise the weekly one
create or replace function play_time_on(c date) returns time
language sql stable security definer set search_path = public as $$
  select coalesce((select p.play_time from play_dates p where p.day = c and p.kind = 'extra'), (select s.play_time from schedule s))
$$;

create or replace function can_start_now(at timestamptz default now()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from schedule s, (values (0), (1)) v(k)
    where is_play_date((at at time zone s.tz)::date + v.k)
      and (at at time zone s.tz) >= ((at at time zone s.tz)::date + v.k) + play_time_on((at at time zone s.tz)::date + v.k) - make_interval(mins => s.opens_minutes)
      and (at at time zone s.tz) < (((at at time zone s.tz)::date + v.k + 1)::timestamp))
$$;

create or replace function rsvp_open(d date, at timestamptz default now()) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p.answer_by is not null then at < p.answer_by
              else (at at time zone s.tz) < d + play_time_on(d) - make_interval(mins => s.rsvp_until_minutes) end
  from schedule s left join play_dates p on p.day = d and p.kind = 'extra'
$$;

create or replace function db_version() returns int language sql immutable as $$ select 20261031 $$;
