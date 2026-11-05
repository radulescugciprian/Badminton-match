-- (Safe to run more than once.)
-- Admins merge two players who are the same person, e.g. someone who made a new account instead of claiming their old player:
-- every match, answer and day line-up of `dup` moves to `keep`, the account moves along, and `dup` is deleted.
create or replace function merge_players(keep bigint, dup bigint) returns void
language plpgsql security definer set search_path = public as $$
declare k players; d players;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select * into k from players where id = keep;
  select * into d from players where id = dup;
  if k.id is null or d.id is null or keep = dup then raise exception 'Pick two different players'; end if;
  if k.user_id is not null and d.user_id is not null then raise exception 'Both players have an account. Remove one of the accounts first.'; end if;
  if exists (select 1 from matches where (keep = any(t1) or keep = any(t2) or rest = keep) and (dup = any(t1) or dup = any(t2) or rest = dup)) then
    raise exception 'They played in the same match, so they cannot be the same person'; end if;
  perform set_config('app.internal', '1', true);   -- lets the account move between players (normally refused)
  update matches set t1 = array_replace(t1, dup, keep), t2 = array_replace(t2, dup, keep), rest = case when rest = dup then keep else rest end
    where dup = any(t1) or dup = any(t2) or rest = dup;
  update days set player_order = case when keep = any(player_order) then array_remove(player_order, dup) else array_replace(player_order, dup, keep) end
    where dup = any(player_order);
  delete from rsvps r where r.player_id = dup and exists (select 1 from rsvps x where x.player_id = keep and x.day_date = r.day_date);
  update rsvps set player_id = keep where player_id = dup;
  update players set user_id = null where id = dup;
  update players set user_id = coalesce(k.user_id, d.user_id), active = true,
    avatar = coalesce(case when d.user_id is not null then d.avatar end, k.avatar, d.avatar)   -- the account owner's own picture wins
    where id = keep;
  delete from players where id = dup;
  perform log_action('merge_players', jsonb_build_object('kept', k.name, 'merged', d.name));
end $$;
revoke all on function merge_players(bigint, bigint) from public, anon;
grant execute on function merge_players(bigint, bigint) to authenticated;

create or replace function db_version() returns int language sql immutable as $$ select 20261109 $$;
