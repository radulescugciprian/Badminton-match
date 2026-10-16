-- Admin tools: remove accounts, and make sure every account has a player.

-- 1) repair: any account that has no player yet gets one (links an unowned player with the same name, else creates one).
--    Safe to run any number of times.
do $$
declare r record; pid bigint;
begin
  for r in select p.id, p.username from profiles p where not exists (select 1 from players x where x.user_id = p.id) order by p.id loop
    select id into pid from players where user_id is null and active and lower(name) = lower(r.username) order by id limit 1;
    if pid is null then insert into players (name, user_id) values (left(r.username, 20), r.id);
    else update players set user_id = r.id where id = pid; end if;
  end loop;
end $$;

-- 2) the "no re-linking" rule must not block the automatic clean-up when an account is deleted
create or replace function guard_player() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.internal', true), '') <> '1' then
    if new.active is distinct from old.active and not is_admin() then raise exception 'Admins only'; end if;
    if new.user_id is distinct from old.user_id then raise exception 'A player cannot be re-linked to another account'; end if;
    if new.avatar is distinct from old.avatar and old.user_id is distinct from auth.uid() then
      raise exception 'Only the player can change their own avatar'; end if;
  end if;
  return new;
end $$;

-- 3) admins can delete someone's account. Their player stays (with all results) and becomes a guest without an account.
create function delete_account(uid uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if uid = auth.uid() then raise exception 'You cannot remove your own account'; end if;
  perform set_config('app.internal', '1', true);
  delete from auth.users where id = uid;
  if not found then raise exception 'No such account'; end if;
end $$;
revoke all on function delete_account(uuid) from public;
grant execute on function delete_account(uuid) to authenticated;
