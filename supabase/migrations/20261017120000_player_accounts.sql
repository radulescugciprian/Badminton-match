-- (Safe to run more than once.)
-- Every account is a player. Only the account owner can change their player's avatar.

alter table players add column if not exists user_id uuid unique references auth.users on delete set null;

-- link existing accounts to the unowned player with the same name, or create one
do $$
declare r record; pid bigint;
begin
  for r in select p.id, p.username from profiles p where not exists (select 1 from players x where x.user_id = p.id) order by p.id loop
    select id into pid from players where user_id is null and lower(name) = lower(r.username) order by id limit 1;
    if pid is null then insert into players (name, user_id) values (left(r.username, 20), r.id);
    else update players set user_id = r.id where id = pid; end if;
  end loop;
end $$;

-- new accounts either claim an existing unowned player (chosen on the sign-up form) or get a new one
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1));
        pid bigint := nullif(new.raw_user_meta_data ->> 'player_id', '')::bigint;
begin
  insert into profiles (id, name, username, is_admin) values (new.id, u, u, not exists (select 1 from profiles));
  update players set user_id = new.id where id = pid and user_id is null and active;
  if not found then insert into players (name, user_id) values (left(u, 20), new.id); end if;
  return new;
end $$;

-- the sign-up form lists the players nobody has claimed yet (callable before logging in)
create or replace function unclaimed_players() returns table (id bigint, name text)
language sql security definer stable set search_path = public as $$
  select id, name from players where user_id is null and active order by name
$$;
revoke all on function unclaimed_players() from public;
grant execute on function unclaimed_players() to anon, authenticated;

-- rules for logged-in users (SQL editor / internal changes have no auth.uid() and are not restricted)
create or replace function guard_player() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if new.active is distinct from old.active and not is_admin() then raise exception 'Admins only'; end if;
    if new.user_id is distinct from old.user_id then raise exception 'A player cannot be re-linked to another account'; end if;
    if new.avatar is distinct from old.avatar and old.user_id is distinct from auth.uid() then
      raise exception 'Only the player can change their own avatar'; end if;
  end if;
  return new;
end $$;

-- players without an account (guests) are added by admins only; everyone else joins by signing up
drop policy if exists "members add" on players;
drop policy if exists "admin adds guests" on players;
create policy "admin adds guests" on players for insert to authenticated with check (is_admin());
