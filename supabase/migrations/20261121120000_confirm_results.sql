-- (Safe to run more than once.)
-- 1) Recording a match: the player resting during it records the winner; the player resting in the next match confirms it.
--    When nobody rests (4 or 2 players) or that player is a guest, any player of the night does it (never the recorder confirming).
-- 2) After a day is closed an admin can propose to swap the winner of a match; a player of the new losing team confirms.
alter table matches add column if not exists confirmed boolean not null default true;   -- matches before this change count as confirmed
alter table matches alter column confirmed set default false;
alter table matches add column if not exists confirm_player bigint references players on delete set null;   -- who should confirm (null: anyone of the night)
alter table matches add column if not exists confirmed_by uuid;
alter table matches add column if not exists fix_win int check (fix_win in (1, 2));   -- an admin's proposed new winner, waiting for the new losing team
alter table matches add column if not exists fix_by uuid;

-- a member of the night: their player is in the day's line-up (or in the match itself)
create or replace function plays_tonight(dayid bigint, extra bigint[] default '{}') returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players p where p.user_id = auth.uid()
    and (p.id = any(extra) or exists (select 1 from days d where d.id = dayid and p.id = any(d.player_order))))
$$;
-- "this player, or anyone of the night when the player is a guest or there is nobody"
create or replace function is_or_stands_in(pid bigint, dayid bigint, extra bigint[]) returns boolean
language sql stable security definer set search_path = public as $$
  select case when pid is not null and (select user_id from players where id = pid) is not null
              then exists (select 1 from players p where p.id = pid and p.user_id = auth.uid())
              else plays_tonight(dayid, extra) end
$$;

create or replace function guard_match() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  if not is_admin() then
    new.confirmed := false; new.fix_win := null;
    if not is_or_stands_in(new.rest, new.day_id, new.t1 || new.t2) then raise exception 'The resting player records this match'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_match on matches;
create trigger guard_match before insert on matches for each row execute function guard_match();

-- the result is right (ok) or the other team won; then it counts as confirmed
create or replace function confirm_match(mid bigint, ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = mid;
  if m.id is null or m.confirmed then return; end if;
  if not is_admin() and (m.created_by = auth.uid() or not is_or_stands_in(m.confirm_player, m.day_id, m.t1 || m.t2)) then
    raise exception 'The next resting player confirms this match';
  end if;
  update matches set confirmed = true, confirmed_by = auth.uid(), win = case when ok then win else 3 - win end where id = mid;
  if not ok then perform log_action('swap_winner', jsonb_build_object('date', (select date from days where id = m.day_id), 'n', m.n)); end if;
end $$;

-- admin: after the day is closed, propose that the other team won
create or replace function propose_fix(mid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from matches m join days d on d.id = m.day_id where m.id = mid and d.closed) then raise exception 'Close the day first'; end if;
  update matches set fix_win = 3 - win, fix_by = auth.uid() where id = mid;
end $$;

-- a player of the new losing team (the current winners) accepts or declines the change
create or replace function answer_fix(mid bigint, ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; losers bigint[]; mine boolean;
begin
  select * into m from matches where id = mid;
  if m.id is null or m.fix_win is null then return; end if;
  losers := case when m.win = 1 then m.t1 else m.t2 end;   -- the team that loses if the change goes through
  mine := exists (select 1 from players p where p.id = any(losers) and p.user_id = auth.uid())
       or (not exists (select 1 from players p where p.id = any(losers) and p.user_id is not null) and plays_tonight(m.day_id, m.t1 || m.t2));
  if not mine or m.fix_by = auth.uid() then raise exception 'A player of the team that would lose confirms this change'; end if;
  if ok then
    update matches set win = fix_win, fix_win = null, fix_by = null, confirmed = true where id = mid;
    perform log_action('fix_match', jsonb_build_object('date', (select date from days where id = m.day_id), 'n', m.n));
  else update matches set fix_win = null, fix_by = null where id = mid; end if;
end $$;
revoke execute on function confirm_match(bigint, boolean), propose_fix(bigint), answer_fix(bigint, boolean) from public, anon;
grant execute on function confirm_match(bigint, boolean), propose_fix(bigint), answer_fix(bigint, boolean) to authenticated;

create or replace function db_version() returns int language sql immutable as $$ select 20261121 $$;
