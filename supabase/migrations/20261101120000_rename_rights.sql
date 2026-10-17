-- (Safe to run more than once.)
-- Only an admin or the player's own account may change a player's name.
create or replace function guard_player() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.internal', true), '') <> '1' then
    if new.active is distinct from old.active and not is_admin()
       and not coalesce(new.active = false and old.user_id is null and old.created_by = auth.uid()
                and (old.created_at at time zone (select tz from schedule))::date = (now() at time zone (select tz from schedule))::date, false) then
      raise exception 'Admins only';
    end if;
    if new.name is distinct from old.name and not is_admin() and old.user_id is distinct from auth.uid() then
      raise exception 'Only an admin or the player can change this name';
    end if;
    if new.user_id is distinct from old.user_id then raise exception 'A player cannot be re-linked to another account'; end if;
    if new.avatar is distinct from old.avatar and old.user_id is distinct from auth.uid() then
      raise exception 'Only the player can change their own avatar'; end if;
  end if;
  return new;
end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261101 $$;
