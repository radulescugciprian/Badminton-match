-- (Safe to run more than once.)
-- 1) db_version(): the app warns admins when the database is older than the app
-- 2) the start and sign-up windows are computed with dates + times, so settings that reach back past midnight work
-- 3) whoever added a guest may remove that guest again on the same day (admins can always remove players)

create or replace function db_version() returns int language sql immutable as $$ select 20261028 $$;

create or replace function is_play_date(c date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from play_dates p where p.day = c and p.kind = 'extra')
      or (extract(dow from c) = (select dow from schedule)
          and not exists (select 1 from play_dates p where p.day = c and p.kind = 'cancelled'))
$$;

-- members may start from `opens_minutes` before play time until the end of the play day (the opening may fall on the evening before)
create or replace function can_start_now(at timestamptz default now()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from schedule s, (values (0), (1)) v(k)
    where is_play_date((at at time zone s.tz)::date + v.k)
      and (at at time zone s.tz) >= ((at at time zone s.tz)::date + v.k) + s.play_time - make_interval(mins => s.opens_minutes)
      and (at at time zone s.tz) < (((at at time zone s.tz)::date + v.k + 1)::timestamp))
$$;

create or replace function rsvp_open(d date, at timestamptz default now()) returns boolean
language sql stable security definer set search_path = public as $$
  select (at at time zone s.tz) < d + s.play_time - make_interval(mins => s.rsvp_until_minutes) from schedule s
$$;

alter table players add column if not exists created_by uuid default auth.uid();
alter table players add column if not exists created_at timestamptz not null default now();

create or replace function guard_player() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.internal', true), '') <> '1' then
    if new.active is distinct from old.active and not is_admin()
       and not coalesce(new.active = false and old.user_id is null and old.created_by = auth.uid()
                and (old.created_at at time zone (select tz from schedule))::date = (now() at time zone (select tz from schedule))::date, false) then
      raise exception 'Admins only';
    end if;
    if new.user_id is distinct from old.user_id then raise exception 'A player cannot be re-linked to another account'; end if;
    if new.avatar is distinct from old.avatar and old.user_id is distinct from auth.uid() then
      raise exception 'Only the player can change their own avatar'; end if;
  end if;
  return new;
end $$;
