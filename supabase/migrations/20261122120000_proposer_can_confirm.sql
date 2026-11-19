-- (Safe to run more than once.)
-- A change to a closed day's result: a player of the team that would then lose confirms it. That may be the admin who
-- proposed it, when they played on that team. Only when that team is all guests does any player of the night confirm,
-- and then never the admin who proposed it.
create or replace function answer_fix(mid bigint, ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; losers bigint[]; mine boolean;
begin
  select * into m from matches where id = mid;
  if m.id is null or m.fix_win is null then return; end if;
  losers := case when m.win = 1 then m.t1 else m.t2 end;   -- the team that loses if the change goes through
  mine := exists (select 1 from players p where p.id = any(losers) and p.user_id = auth.uid())
       or (not exists (select 1 from players p where p.id = any(losers) and p.user_id is not null)
           and plays_tonight(m.day_id, m.t1 || m.t2) and m.fix_by is distinct from auth.uid());
  if not mine then raise exception 'A player of the team that would lose confirms this change'; end if;
  if ok then
    update matches set win = fix_win, fix_win = null, fix_by = null, confirmed = true where id = mid;
    perform log_action('fix_match', jsonb_build_object('date', (select date from days where id = m.day_id), 'n', m.n));
  else update matches set fix_win = null, fix_by = null where id = mid; end if;
end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261122 $$;
