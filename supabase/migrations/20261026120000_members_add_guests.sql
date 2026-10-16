-- (Safe to run more than once.)
-- Any member may add a guest player (no account) and pick 4 or 5 players; removing a player stays admin-only.
drop policy if exists "admin adds guests" on players;
drop policy if exists "members add guests" on players;
create policy "members add guests" on players for insert to authenticated with check (is_admin() or user_id is null);
