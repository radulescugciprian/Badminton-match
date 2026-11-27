-- Playing in 3 ("winner stays"): anyone playing that night records the winner and nothing waits for a confirmation.
-- An admin may change a winner from the day after the match day even if nobody closed the day.
-- (Admins could already confirm any match waiting for its confirmation: confirm_match lets them.)

create or replace function guard_match() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  if (select mode from days where id = new.day_id) = 3 then
    if not is_admin() and not plays_tonight(new.day_id, new.t1 || new.t2) then raise exception 'A player of tonight records this match'; end if;
    new.confirmed := true; new.confirm_player := null; new.fix_win := null;
    return new;
  end if;
  if not is_admin() then
    new.confirmed := false; new.fix_win := null;
    if not is_or_stands_in(new.rest, new.day_id, new.t1 || new.t2) then raise exception 'The resting player records this match'; end if;
  end if;
  return new;
end $$;

create or replace function propose_fix(mid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from matches m join days d on d.id = m.day_id where m.id = mid and (d.closed or d.date < current_date)) then
    raise exception 'Close the day first';
  end if;
  update matches set fix_win = 3 - win, fix_by = auth.uid() where id = mid;
end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261127 $$;
